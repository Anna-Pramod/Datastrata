/**
 * Fact resolution: joins the private customer graph (scope objects + sourced
 * facts) to the shared FactType registry.
 *
 * Trust boundary: only CONFIRMED facts are visible here. Extracted candidate
 * facts (confirmed=false) are treated as missing until a human confirms them.
 */

import type { FactType, Profile, ScopeObject, ScopeType } from '../types';
import type { ResolvedFact } from '../condition/evaluate';
import { EngineContentError } from '../condition/evaluate';

export class FactResolver {
  private byId = new Map<string, ScopeObject>();
  private children = new Map<string, ScopeObject[]>();
  private factIndex = new Map<string, Profile['facts'][number]>();
  private factTypes: Map<string, FactType>;

  constructor(private profile: Profile, factTypes: FactType[]) {
    this.factTypes = new Map(factTypes.map((f) => [f.id, f]));
    for (const o of profile.scopeObjects) {
      this.byId.set(o.id, o);
      if (o.parentId) {
        const list = this.children.get(o.parentId) ?? [];
        list.push(o);
        this.children.set(o.parentId, list);
      }
    }
    for (const f of profile.facts) {
      if (!f.confirmed) continue; // trust boundary
      this.factIndex.set(`${f.factType}::${f.scopeId}`, f);
    }
  }

  factType(id: string): FactType {
    const ft = this.factTypes.get(id);
    if (!ft) throw new EngineContentError(`Unknown FactType referenced by a condition: ${id}`);
    return ft;
  }

  scope(id: string): ScopeObject | undefined {
    return this.byId.get(id);
  }

  /** Walk up the parent chain looking for a scope object of the wanted type. */
  private ancestorOfType(from: ScopeObject, type: ScopeType): ScopeObject | undefined {
    let cur: ScopeObject | undefined = from;
    while (cur) {
      if (cur.type === type) return cur;
      cur = cur.parentId ? this.byId.get(cur.parentId) : undefined;
    }
    return undefined;
  }

  descendantsOfType(from: ScopeObject, type: ScopeType): ScopeObject[] {
    const result: ScopeObject[] = [];
    const walk = (id: string) => {
      for (const c of this.children.get(id) ?? []) {
        if (c.type === type) result.push(c);
        walk(c.id);
      }
    };
    walk(from.id);
    return result;
  }

  /**
   * Resolve the scope object a fact type attaches to, relative to the scope
   * being evaluated: same object, linked counterparty, or nearest ancestor of
   * the fact type's scope type.
   */
  targetScope(ft: FactType, evalScope: ScopeObject): ScopeObject | undefined {
    if (ft.scopeType === evalScope.type) return evalScope;
    if (ft.scopeType === 'counterparty' && evalScope.links?.counterparty) {
      return this.byId.get(evalScope.links.counterparty);
    }
    return this.ancestorOfType(evalScope, ft.scopeType);
  }

  resolve(factTypeId: string, evalScope: ScopeObject): ResolvedFact {
    const ft = this.factType(factTypeId);
    const missingReason = ft.missingReason ?? 'missing_fact';
    const target = this.targetScope(ft, evalScope);
    if (!target) {
      return { present: false, scopeId: evalScope.id, missingReason: 'customer_scope_ambiguity' };
    }
    const fact = this.factIndex.get(`${factTypeId}::${target.id}`);
    if (!fact || fact.value.kind === 'unknown') {
      return { present: false, scopeId: target.id, missingReason };
    }
    return { present: true, value: fact.value, scopeId: target.id, source: fact.source, missingReason };
  }
}
