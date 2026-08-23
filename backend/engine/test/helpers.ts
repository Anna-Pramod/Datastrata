import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack } from '../src/knowledge/loader';
import type { AssessmentContext, FactValue, KnowledgePack, Profile, ProfileFact, ScopeObject, ScopeType } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));

let cached: KnowledgePack | undefined;
export function csrdPack(): KnowledgePack {
  cached ??= loadPack(join(here, '..', 'knowledge', 'csrd'));
  return cached;
}

export function ctx(fyStart: string, fyEnd: string, subjectId: string): AssessmentContext {
  return { assessmentDate: '2026-07-26', financialYear: { start: fyStart, end: fyEnd }, subjectId };
}

export class ProfileBuilder {
  private objects: ScopeObject[] = [];
  private facts: ProfileFact[] = [];

  scope(id: string, type: ScopeType, name: string, parentId?: string, links?: ScopeObject['links']): this {
    this.objects.push({ id, type, name, parentId, links });
    return this;
  }

  org(id: string, name: string): this {
    return this.scope(id, 'organization', name);
  }
  entity(id: string, name: string, parentId?: string): this {
    return this.scope(id, 'legal_entity', name, parentId);
  }
  branch(id: string, name: string, parentId?: string): this {
    return this.scope(id, 'branch', name, parentId);
  }
  request(id: string, name: string, parentId: string, counterpartyId?: string): this {
    return this.scope(id, 'request', name, parentId, counterpartyId ? { counterparty: counterpartyId } : undefined);
  }
  counterparty(id: string, name: string): this {
    return this.scope(id, 'counterparty', name);
  }

  fact(scopeId: string, factType: string, value: FactValue, confirmed = true): this {
    this.facts.push({ factType, scopeId, value, confirmed, source: { kind: 'customer_statement', ref: 'test fixture' } });
    return this;
  }
  num(scopeId: string, factType: string, value: number): this {
    return this.fact(scopeId, factType, { kind: 'number', value });
  }
  range(scopeId: string, factType: string, min: number, max: number): this {
    return this.fact(scopeId, factType, { kind: 'range', min, max });
  }
  bool(scopeId: string, factType: string, value: boolean): this {
    return this.fact(scopeId, factType, { kind: 'boolean', value });
  }
  str(scopeId: string, factType: string, value: string): this {
    return this.fact(scopeId, factType, { kind: 'string', value });
  }
  year(scopeId: string, factType: string, value: number): this {
    return this.fact(scopeId, factType, { kind: 'year', value });
  }
  list(scopeId: string, factType: string, values: string[]): this {
    return this.fact(scopeId, factType, { kind: 'list', values });
  }

  /** Standard confirmed EU entity boilerplate: country, legal form, group-role flags. */
  euEntity(id: string, name: string, country: string, opts: { parentId?: string; isParent?: boolean; isSubsidiary?: boolean } = {}): this {
    this.entity(id, name, opts.parentId);
    this.str(id, 'entity.incorporation_country', country);
    this.str(id, 'entity.legal_form', 'private_limited_company');
    this.bool(id, 'entity.is_parent_undertaking', opts.isParent ?? false);
    this.bool(id, 'entity.is_subsidiary', opts.isSubsidiary ?? false);
    return this;
  }

  build(): Profile {
    return { scopeObjects: this.objects, facts: this.facts };
  }
}

// ---------------------------------------------------------------------------
// The network trap
// ---------------------------------------------------------------------------

/** What a trapped run recorded, and how to put `fetch` back. */
export interface NetworkTrap {
  calls: string[];
  restore(): void;
}

/**
 * Intercepts `globalThis.fetch`, and only that.
 *
 * Sound today because the one thing that can reach the network —
 * `LiveAgentRunner` — goes through `fetch`, and `pipeline-runner.test.ts`
 * drives it into this trap and asserts the call was recorded. **It is not sound
 * for a runner that reaches for `node:https`, `node:http` or undici's
 * `request`/`Agent` directly**, which would bypass this entirely and leave every
 * "trap.calls is empty" assertion vacuously green — evidence-standard failure
 * mode 7. A task adding such a runner must widen the trap (mock the module, or
 * install an undici `MockAgent`) and re-run its own positive control against the
 * new path before believing any of these greens.
 *
 * It lives here rather than in one test file because Task 5d needs the same
 * trap over the `verify run` command path, and two copies of a trap are two
 * things that can come to intercept different surfaces while both files go on
 * asserting the same empty array.
 */
export function installNetworkTrap(): NetworkTrap {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: unknown): never => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : String((input as { url?: unknown }).url ?? input);
    calls.push(url);
    throw new Error(`NETWORK TRAP: the default suite attempted a network call to ${url}`);
  }) as unknown as typeof fetch;
  return {
    calls,
    restore(): void {
      globalThis.fetch = original;
    },
  };
}
