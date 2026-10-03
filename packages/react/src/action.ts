/** Thrown when an action is called outside a user gesture. */
export class ActionBlocked extends Error {}

/**
 * Wrap a kit function that changes data. It throws unless called during a user
 * gesture, so a generated component cannot, for example, submit a plan as soon
 * as it renders. Browsers without `navigator.userActivation` are not checked.
 */
export function action<A extends unknown[], R>(fn: (...args: A) => R, name = fn.name || "this action"): (...args: A) => R {
  return (...args) => {
    const activation = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    if (activation && !activation.isActive) throw new ActionBlocked(`${name} can only run in response to a click or key press`);
    return fn(...args);
  };
}
