/**
 * The check flow's wiring to its request lifecycle, read from the flow's source (Codex's review of Task 6, finding 3).
 *
 * **Why this file exists.** `lib/check-request.ts` applies a request's ending only if nothing has superseded it, and
 * `check-request.test.ts` holds that rule with delayed responses. The rule protects the page only if the page uses it: sends no
 * request of its own, applies an ending only inside the callback it hands the module, and calls the module's `supersede` at
 * every point a visitor can leave the check a request was sent for. There is no DOM in this workspace, and none may be added,
 * so the flow cannot be clicked here; it is parsed instead, with the TypeScript compiler the typecheck already runs (a
 * development dependency of this workspace, not a new one), and its shape is checked.
 *
 * **What this proves:** the flow references no `fetch`, abort controller, timer or timeout of its own; it holds one lifecycle
 * object for its whole life (`useState(() => checkRequests(…))`, or a ref read through `.current`), never one made per render,
 * whose `supersede` would reach nothing in flight; `restart`, `go`, `choose` and `back`, and the country select's and the typed
 * figure's `onChange`, each call `supersede` as the **first** statement of their own body, so no early return skips it; an
 * unmount cleanup supersedes the request in flight; `submit` starts its request through the module; the outcome is set (other
 * than cleared) and the result screen shown only inside the module's settle callback, and the screen changes only through the
 * one function that navigation and that callback share; the running flag is never set by the flow; and every event handler in
 * the flow reaches one of the superseding functions or `submit`.
 *
 * **What it does not prove,** and only a browser can show: that React calls these handlers on the clicks and keystrokes a
 * visitor makes, and what the screen, the focus and the loading state look like after a late response. That is the parent's
 * browser check.
 *
 * Each check is shown to fail on planted text (failure mode 7): every one of the six `supersede` statements is removed from the
 * real source in turn and reported missing, one is moved below an early return and reported, the object made per render (a bare
 * call, `useMemo`) is reported while a ref is accepted, the unmount cleanup removed or emptied is reported, and a planted
 * `fetch`, an outcome set outside the callback and an unwired click are each reported.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const FLOW = fileURLToPath(new URL('../components/marketing/CheckFlow.tsx', import.meta.url));
const SOURCE = readFileSync(FLOW, 'utf8');

/** The points that must supersede a request in flight, as the brief names them. */
const POINTS = ['restart', 'go', 'choose', 'back', 'country onChange', 'typed onChange'] as const;
type Point = (typeof POINTS)[number];
/** What belongs to the lifecycle module, never to the flow. */
const LIFECYCLE = ['fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'CHECK_TIMEOUT_MS'];
/** The functions an event handler may reach: each supersedes, or (`submit`) starts a request, which supersedes the last. */
const REACHES = new Set(['go', 'restart', 'back', 'choose', 'submit', 'onSubmit', 'onChoose']);

interface Wiring {
  /** The name `checkRequests(...)`'s object is bound to in the flow. */
  binding: string | null;
  /** How many declarations call `checkRequests`. */
  bindings: number;
  /** How the object is held: `useState` or `useRef` (once for the component's life), or `per render: <initializer>`. */
  bindingForm: string;
  /** Whether an effect's cleanup supersedes the request in flight when the flow unmounts. */
  unmountSupersedes: boolean;
  /** Each lifecycle identifier the flow uses itself, with its line. */
  lifecycle: string[];
  /** Whether each point calls `<binding>.supersede()` as the first statement of its own body. */
  supersedes: Record<Point, boolean>;
  /** Whether `submit` starts its request through `<binding>.start(answers, callback)`. */
  submitStarts: boolean;
  /** Each call that settles or navigates outside its place: an outcome set, the result shown, the screen or running flag set. */
  outside: string[];
  /** Every event attribute in the flow, with its line. */
  events: string[];
  /** Each event attribute whose handler reaches no superseding function and starts no request. */
  unwired: string[];
}

function wiringOf(text: string): Wiring {
  const file = ts.createSourceFile('CheckFlow.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const line = (node: ts.Node): number => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const all: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    all.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const within = (node: ts.Node, outer: ts.Node | undefined): boolean => outer !== undefined && node.pos >= outer.pos && node.end <= outer.end;
  const calleeName = (call: ts.CallExpression): string | null => (ts.isIdentifier(call.expression) ? call.expression.text : null);
  const calls = all.filter(ts.isCallExpression);

  // The binding: the variable whose initializer calls `checkRequests`, and how it holds the object. Only a form that keeps one
  // object for the component's life is accepted: `const [requests] = useState(() => checkRequests(…))`, or
  // `const requests = useRef(checkRequests(…))` read through `.current`. A bare call, `useMemo` or any other form can make a new
  // object on a later render, whose `supersede` reaches nothing in flight, and the late ending is applied (the review's T1).
  const isLifecycleCall = (node: ts.Node | undefined): boolean => node !== undefined && ts.isCallExpression(node) && calleeName(node) === 'checkRequests';
  const holders = all
    .filter(ts.isVariableDeclaration)
    .filter((declaration) => declaration.initializer !== undefined && calls.some((call) => calleeName(call) === 'checkRequests' && within(call, declaration.initializer)));
  let binding: string | null = null;
  let bindingForm = 'none';
  for (const declaration of holders) {
    const init = declaration.initializer!;
    const factory = ts.isCallExpression(init) && init.arguments.length === 1 ? init.arguments[0] : undefined;
    const only = ts.isArrayBindingPattern(declaration.name) && declaration.name.elements.length === 1 ? declaration.name.elements[0] : undefined;
    if (
      only !== undefined &&
      ts.isBindingElement(only) &&
      ts.isIdentifier(only.name) &&
      ts.isCallExpression(init) &&
      calleeName(init) === 'useState' &&
      factory !== undefined &&
      ts.isArrowFunction(factory) &&
      factory.parameters.length === 0 &&
      isLifecycleCall(factory.body)
    ) {
      binding = only.name.text;
      bindingForm = 'useState';
    } else if (ts.isIdentifier(declaration.name) && ts.isCallExpression(init) && calleeName(init) === 'useRef' && isLifecycleCall(factory)) {
      binding = declaration.name.text;
      bindingForm = 'useRef';
    } else {
      const first = ts.isArrayBindingPattern(declaration.name) ? declaration.name.elements[0] : undefined;
      if (ts.isIdentifier(declaration.name)) binding = declaration.name.text;
      else if (first !== undefined && ts.isBindingElement(first) && ts.isIdentifier(first.name)) binding = first.name.text;
      bindingForm = `per render: ${init.getText(file)}`;
    }
  }

  /** What a method of the object is called on: `requests`, or `requests.current` for a ref. */
  const isReceiver = (node: ts.Expression): boolean =>
    bindingForm === 'useRef'
      ? ts.isPropertyAccessExpression(node) && node.name.text === 'current' && ts.isIdentifier(node.expression) && node.expression.text === binding
      : ts.isIdentifier(node) && node.text === binding;
  const isMethodCall = (node: ts.Node, method: string): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === method && isReceiver(node.expression.expression);
  /**
   * Whether a function body's **first** statement is `<binding>.supersede();`. Anywhere later, an early return before it skips
   * it: `choose` returns early for "type the figure" (the review's T2).
   */
  const supersedesIn = (body: ts.Node | undefined): boolean => {
    if (body === undefined || !ts.isBlock(body)) return false;
    const first = body.statements[0];
    return first !== undefined && ts.isExpressionStatement(first) && isMethodCall(first.expression, 'supersede') && first.expression.arguments.length === 0;
  };

  // The unmount cleanup: an effect whose returned function calls `<binding>.supersede()`, depending on nothing but the object, so
  // it runs when the flow leaves the page and not on a render.
  const unmountSupersedes = calls.some((call) => {
    if (calleeName(call) !== 'useEffect') return false;
    const [effect, deps] = call.arguments;
    if (effect === undefined || !(ts.isArrowFunction(effect) || ts.isFunctionExpression(effect))) return false;
    const returned = ts.isBlock(effect.body) ? effect.body.statements.find(ts.isReturnStatement)?.expression : effect.body;
    if (returned === undefined || !(ts.isArrowFunction(returned) || ts.isFunctionExpression(returned))) return false;
    const cleanup = returned.body;
    const supersedes = ts.isBlock(cleanup)
      ? cleanup.statements.some((statement) => ts.isExpressionStatement(statement) && isMethodCall(statement.expression, 'supersede'))
      : isMethodCall(cleanup, 'supersede');
    const stable = deps !== undefined && ts.isArrayLiteralExpression(deps) && deps.elements.every((element) => ts.isIdentifier(element) && element.text === binding);
    return supersedes && stable;
  });

  /** The body of the function declared under `name`, as a `const` arrow or function expression, or a function declaration. */
  const bodyOf = (name: string): ts.Node | undefined => {
    for (const node of all) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer !== undefined) {
        if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) return node.initializer.body;
      }
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.body;
    }
    return undefined;
  };

  // The two onChange handlers that edit an answer directly: the country select, and the input that takes a typed figure.
  const handlerOf = (attribute: ts.JsxAttribute): ts.Node | undefined => {
    const initializer = attribute.initializer;
    if (initializer === undefined || !ts.isJsxExpression(initializer) || initializer.expression === undefined) return undefined;
    const expression = initializer.expression;
    return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression) ? expression.body : expression;
  };
  const elementOf = (attribute: ts.JsxAttribute): ts.JsxOpeningLikeElement => attribute.parent.parent;
  const tagOf = (attribute: ts.JsxAttribute): string => elementOf(attribute).tagName.getText(file);
  const hasAttribute = (element: ts.JsxOpeningLikeElement, name: string): boolean =>
    element.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.name.getText(file) === name);
  const attributes = all.filter(ts.isJsxAttribute);
  const onChangeOf = (match: (attribute: ts.JsxAttribute) => boolean): boolean => {
    const found = attributes.filter((a) => a.name.getText(file) === 'onChange' && match(a));
    return found.length > 0 && found.every((a) => supersedesIn(handlerOf(a)));
  };

  // `submit`, and the callback it hands `<binding>.start`.
  const submit = bodyOf('submit');
  const start = calls.find((call) => isMethodCall(call, 'start') && within(call, submit));
  const callback = start?.arguments[1];
  const settleCallback = callback !== undefined && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ? callback : undefined;

  const showBody = bodyOf('show');
  const allowedShow = [bodyOf('go'), bodyOf('restart'), bodyOf('back'), settleCallback];
  const outside: string[] = [];
  for (const call of calls) {
    const name = calleeName(call);
    const first = call.arguments[0];
    if (name === 'setOutcome' && !(first !== undefined && first.kind === ts.SyntaxKind.NullKeyword) && !within(call, settleCallback)) outside.push(`setOutcome at line ${line(call)}`);
    if (name === 'setRunning') outside.push(`setRunning at line ${line(call)}`);
    if (name === 'setScreen' && !within(call, showBody)) outside.push(`setScreen at line ${line(call)}`);
    if (name === 'show' && !allowedShow.some((place) => within(call, place))) outside.push(`show at line ${line(call)}`);
  }

  const events = attributes.filter((a) => /^on[A-Z]/.test(a.name.getText(file)));
  const reaches = (handler: ts.Node | undefined): boolean => {
    if (handler === undefined) return false;
    let found = false;
    const look = (node: ts.Node): void => {
      if ((ts.isIdentifier(node) && REACHES.has(node.text)) || isMethodCall(node, 'supersede')) found = true;
      ts.forEachChild(node, look);
    };
    look(handler);
    return found;
  };

  return {
    binding,
    bindings: holders.length,
    bindingForm,
    unmountSupersedes,
    lifecycle: all.filter((node): node is ts.Identifier => ts.isIdentifier(node) && LIFECYCLE.includes(node.text)).map((node) => `${node.text} at line ${line(node)}`),
    supersedes: {
      restart: supersedesIn(bodyOf('restart')),
      go: supersedesIn(bodyOf('go')),
      choose: supersedesIn(bodyOf('choose')),
      back: supersedesIn(bodyOf('back')),
      'country onChange': onChangeOf((a) => tagOf(a) === 'select'),
      'typed onChange': onChangeOf((a) => tagOf(a) === 'input' && hasAttribute(elementOf(a), 'inputMode')),
    },
    submitStarts: start !== undefined && settleCallback !== undefined,
    outside,
    events: events.map((a) => `${a.name.getText(file)} at line ${line(a)}`),
    unwired: events.filter((a) => !reaches(handlerOf(a))).map((a) => `${a.name.getText(file)} at line ${line(a)}`),
  };
}

const EVERY_POINT: Record<Point, boolean> = { restart: true, go: true, choose: true, back: true, 'country onChange': true, 'typed onChange': true };

describe('CheckFlow.tsx, wired to the request lifecycle', () => {
  const wiring = wiringOf(SOURCE);

  it('sends no request of its own: no fetch, abort controller, timer or timeout in the flow', () => {
    expect(wiring.lifecycle, `the flow handles a request itself: ${wiring.lifecycle.join(', ')}`).toEqual([]);
    expect(wiring.binding, 'the flow holds a checkRequests object').toBe('requests');
  });

  it('holds one lifecycle object for its whole life, never one made per render', () => {
    expect(wiring.bindings, 'one declaration calls checkRequests').toBe(1);
    expect(['useState', 'useRef'], `requests is held ${wiring.bindingForm}`).toContain(wiring.bindingForm);
  });

  it('calls supersede first in restart, go, choose, back, and the country and typed-figure onChange', () => {
    expect(wiring.supersedes).toEqual(EVERY_POINT);
  });

  it('supersedes the request in flight when it unmounts', () => {
    expect(wiring.unmountSupersedes, 'an effect cleanup calls requests.supersede(), with [requests] as its only dependency').toBe(true);
  });

  it('starts its request through the module, and settles only through it: the outcome, the result screen and the running flag are set nowhere else', () => {
    expect(wiring.submitStarts, 'submit calls requests.start(answers, callback)').toBe(true);
    expect(wiring.outside, `settled or navigated outside its place: ${wiring.outside.join(', ')}`).toEqual([]);
  });

  it('has no event handler that reaches neither a superseding function nor submit', () => {
    // The control for the scan: it sees the flow's own handlers, of every kind the flow uses.
    expect(new Set(wiring.events.map((event) => event.split(' ')[0]))).toEqual(new Set(['onClick', 'onStep', 'onChange', 'onSubmit', 'onChoose']));
    expect(wiring.unwired, `event handlers that skip the lifecycle: ${wiring.unwired.join(', ')}`).toEqual([]);
  });
});

describe('the wiring checks, on planted text', () => {
  it('report each of the six supersede statements missing when it alone is removed from the real source', () => {
    const file = ts.createSourceFile('CheckFlow.tsx', SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const statements: ts.ExpressionStatement[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isExpressionStatement(node) && node.expression.getText(file) === 'requests.supersede()') statements.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(statements, 'one supersede statement per point').toHaveLength(POINTS.length);

    const missing = statements.map((statement) => {
      const planted = SOURCE.slice(0, statement.getStart(file)) + SOURCE.slice(statement.end);
      expect(planted).not.toBe(SOURCE);
      return POINTS.filter((point) => !wiringOf(planted).supersedes[point]);
    });
    // Each removal is reported, at exactly one point, and the six removals between them cover all six points.
    expect(missing.map((points) => points.length)).toEqual(POINTS.map(() => 1));
    expect(new Set(missing.flat())).toEqual(new Set(POINTS));
  });

  it('report a supersede moved below an early return: choose’s, below its "type the figure" block', () => {
    const top = '  const choose = (value: string) => {\n    requests.supersede();\n    if (value === TYPED) {';
    const after = '      return;\n    }\n    setTyped((t) => {';
    expect([SOURCE.split(top).length, SOURCE.split(after).length]).toEqual([2, 2]);
    const planted = SOURCE.replace(top, '  const choose = (value: string) => {\n    if (value === TYPED) {').replace(after, '      return;\n    }\n    requests.supersede();\n    setTyped((t) => {');
    const moved = wiringOf(planted);
    expect(moved.supersedes).toEqual({ ...EVERY_POINT, choose: false });
    // Moved, not removed: the statement is still in `choose`, only no longer first.
    expect(planted.split('requests.supersede();').length).toBe(SOURCE.split('requests.supersede();').length);
  });

  it('report the object made on every render, by a bare call and by useMemo; and accept a ref read through .current', () => {
    const DECLARATION = 'const [requests] = useState(() => checkRequests(setRunning));';
    expect(SOURCE.split(DECLARATION).length).toBe(2);
    const bare = wiringOf(SOURCE.replace(DECLARATION, 'const requests = checkRequests(setRunning);'));
    const memo = wiringOf(SOURCE.replace(DECLARATION, 'const requests = useMemo(() => checkRequests(setRunning), [answers]);'));
    expect([bare.bindingForm, memo.bindingForm]).toEqual(['per render: checkRequests(setRunning)', 'per render: useMemo(() => checkRequests(setRunning), [answers])']);
    const ref = wiringOf(SOURCE.replace(DECLARATION, 'const requests = useRef(checkRequests(setRunning));').replaceAll('requests.', 'requests.current.'));
    expect([ref.bindingForm, ref.supersedes, ref.unmountSupersedes, ref.submitStarts, ref.outside]).toEqual(['useRef', EVERY_POINT, true, true, []]);
  });

  it('report the unmount cleanup removed, emptied, or run on a render', () => {
    const CLEANUP = 'useEffect(() => () => requests.supersede(), [requests]);';
    expect(SOURCE.split(CLEANUP).length).toBe(2);
    const variants = [SOURCE.replace(CLEANUP, ''), SOURCE.replace(CLEANUP, 'useEffect(() => () => undefined, [requests]);'), SOURCE.replace(CLEANUP, 'useEffect(() => () => requests.supersede(), [answers]);')];
    expect(variants.map((variant) => wiringOf(variant).unmountSupersedes)).toEqual([false, false, false]);
  });

  it('report a fetch, an abort controller and a timer the flow uses itself', () => {
    const planted = `${SOURCE}\nexport function planted() { setTimeout(() => {}, 1); return fetch('/api/check', { signal: new AbortController().signal }); }\n`;
    expect(wiringOf(planted).lifecycle.map((found) => found.split(' ')[0])).toEqual(['setTimeout', 'fetch', 'AbortController']);
  });

  it('report an outcome set, a result shown, a screen set and a running flag set outside their places', () => {
    const planted = `${SOURCE}\nfunction planted(next: never) { setOutcome(next); show({ kind: 'outcome' }); setScreen({ kind: 'outcome' }); setRunning(false); }\n`;
    expect(wiringOf(planted).outside.map((found) => found.split(' ')[0])).toEqual(['setOutcome', 'show', 'setScreen', 'setRunning']);
  });

  it('report an event handler that reaches nothing that supersedes, and a submit that does not start through the module', () => {
    const planted = `${SOURCE}\nconst plantedButton = <button onClick={() => setAnswers({})} />;\n`;
    expect(wiringOf(planted).unwired.map((found) => found.split(' ')[0])).toEqual(['onClick']);
    const unstarted = SOURCE.replace('requests.start(', 'requests.begin(');
    expect(unstarted).not.toBe(SOURCE);
    expect(wiringOf(unstarted).submitStarts).toBe(false);
  });
});
