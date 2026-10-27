/**
 * Stand-in for Stripe.js in the hermetic gift specs (card only: no wallet, no Link). The real Elements iframes cannot be created
 * without a real PaymentIntent, and tonight nothing may talk to Stripe. It mounts a tall iframe with card-like fields for the
 * PaymentElement and answers stripe.confirmPayment from a script the spec controls.
 *
 * Controls (on `window`):
 *   __confirmResults = [ 'held' | 'declined' | 'pending' | 'closed' ... ]   the answers of the next confirmPayment calls (default 'held').
 *       'pending' leaves the call hanging until __resolveConfirm('held' | 'declined') is called; 'closed' answers the error Stripe gives
 *       when the PaymentIntent was cancelled meanwhile (payment_intent_unexpected_state).
 *   __confirmCalls: how many times confirmPayment ran.
 *   __elementOptions: the options each Element was created with (so a spec can assert wallets.link === 'never').
 */
export const STRIPE_STUB = `
window.__confirmCalls = 0;
window.__confirmResults = [];
window.__elementOptions = [];
window.Stripe = function () {
  var pending = null;
  var handlers = {};
  var emit = function (name) { (handlers[name] || []).forEach(function (h) { h({}); }); };
  var cardElement = {
    mount: function (node) {
      var frame = document.createElement('iframe');
      frame.setAttribute('data-fake-stripe', '1');
      frame.style.cssText = 'width:100%;height:340px;border:0;display:block';
      frame.srcdoc = '<body style="margin:0;font:16px sans-serif">' +
        ['Card number', 'MM / YY', 'CVC', 'Country', 'ZIP'].map(function (p) {
          return '<input placeholder="' + p + '" style="font-size:16px;box-sizing:border-box;width:100%;height:44px;margin:0 0 12px;padding:0 12px;border:1px solid #888;border-radius:12px">';
        }).join('') + '</body>';
      frame.onload = function () { emit('ready'); };
      node.appendChild(frame);
    },
    on: function (name, handler) { (handlers[name] = handlers[name] || []).push(handler); },
    off: function () {}, update: function () {}, unmount: function () {}, destroy: function () {},
  };
  var noWallet = {
    mount: function () { setTimeout(function () { (noWallet.h || []).forEach(function (f) { f({ elementType: 'expressCheckout', paymentMethods: undefined }); }); }, 30); },
    on: function (name, handler) { if (name === 'availablepaymentmethodschange') (noWallet.h = noWallet.h || []).push(handler); },
    off: function () {}, update: function () {}, unmount: function () {}, destroy: function () {},
  };
  var answer = function (kind) {
    if (kind === 'declined') return { error: { type: 'card_error', code: 'card_declined', message: 'Tu tarjeta fue rechazada.' } };
    if (kind === 'closed') return { error: { type: 'invalid_request_error', code: 'payment_intent_unexpected_state', message: 'closed' } };
    return { paymentIntent: { status: 'requires_capture' } };
  };
  window.__resolveConfirm = function (kind) { if (pending) { pending(answer(kind)); pending = null; } };
  return {
    elements: function () {
      return {
        create: function (type, options) { window.__elementOptions.push({ type: type, options: options || null }); return type === 'expressCheckout' ? noWallet : cardElement; },
        getElement: function () { return null; }, update: function () {}, fetchUpdates: function () { return Promise.resolve(); }, submit: function () { return Promise.resolve({}); },
      };
    },
    createToken: function () {}, createPaymentMethod: function () {}, confirmCardPayment: function () {},
    confirmPayment: function () {
      window.__confirmCalls += 1;
      var kind = window.__confirmResults.length ? window.__confirmResults.shift() : 'held';
      if (kind === 'pending') return new Promise(function (resolve) { pending = resolve; });
      return Promise.resolve(answer(kind));
    },
  };
};`;
