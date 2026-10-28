/**
 * Stand-in for Stripe.js in the gift payment specs (the real Elements iframes cannot be created without a real PaymentIntent). It
 * mounts a tall iframe with card-like fields for the PaymentElement and a tiny fake wallet button for the Express Checkout Element.
 * It tests OUR layout and OUR payment function, not Stripe's forms.
 *
 * Controls the specs use (all on `window`):
 *   __fakeCardCompact = true: a ~200 px card form (closer to Stripe's real one: number, expiry/CVC, country, postal code); default 340 px (taller than the real one).
 *   __wallet = 'apple' | 'google' | 'none'   (default 'none'): which wallet the Express Checkout Element reports as available.
 *   __confirmResults = [ 'held' | 'declined' | 'pending' ... ]: the answers of the next confirmPayment calls (default 'held').
 *       'pending' leaves the call hanging until window.__resolveConfirm('held' | 'declined') is called.
 *   __confirmCalls: how many times confirmPayment ran.   __paymentFailedCalls: how many times event.paymentFailed() was called.
 *   __fireWallet('confirm' | 'cancel'): what Apple Pay / Google Pay would emit after the person authorises / closes the sheet.
 */
export const FAKE_STRIPE = `
window.__confirmCalls = 0;
window.__paymentFailedCalls = 0;
window.__confirmResults = [];
window.Stripe = function () {
  var handlers = {};
  var emit = function (name) { (handlers[name] || []).forEach(function (h) { h({}); }); };
  var pending = null;
  var cardElement = {
    mount: function (node) {
      var frame = document.createElement('iframe');
      frame.setAttribute('data-fake-stripe', '1');
      var compact = !!window.__fakeCardCompact;
      frame.style.cssText = 'width:100%;height:' + (compact ? 200 : 340) + 'px;border:0;display:block';
      frame.srcdoc = '<body style="margin:0;font:16px sans-serif">' +
        ['Card number', 'MM / YY', 'CVC', 'Country', 'ZIP'].map(function (p) {
          return '<input placeholder="' + p + '" style="font-size:16px;box-sizing:border-box;width:100%;height:' + (compact ? 36 : 44) + 'px;margin:0 0 ' + (compact ? 4 : 12) + 'px;padding:0 12px;border:1px solid #888;border-radius:12px">';
        }).join('') + '</body>';
      frame.onload = function () {
        frame.contentDocument.querySelectorAll('input').forEach(function (input) {
          input.addEventListener('focus', function () { emit('focus'); });
          input.addEventListener('blur', function () { emit('blur'); });
        });
        emit('ready');
      };
      node.appendChild(frame);
    },
    on: function (name, handler) { (handlers[name] = handlers[name] || []).push(handler); },
    off: function () {}, update: function () {}, unmount: function () {}, destroy: function () {},
  };
  var walletHandlers = {};
  var walletElement = {
    mount: function (node) {
      var kind = window.__wallet || 'none';
      if (kind !== 'none') {
        var button = document.createElement('button');
        button.setAttribute('data-fake-wallet', kind);
        button.style.cssText = 'width:100%;height:48px;border:0;border-radius:12px;background:#000;color:#fff;font:600 16px sans-serif';
        button.textContent = kind === 'apple' ? 'Apple Pay' : 'Google Pay';
        node.appendChild(button);
      }
      setTimeout(function () {
        var methods = kind === 'apple' ? { applePay: { available: true } } : kind === 'google' ? { googlePay: { available: true } } : undefined;
        (walletHandlers.availablepaymentmethodschange || []).forEach(function (h) { h({ elementType: 'expressCheckout', paymentMethods: methods }); });
        (walletHandlers.ready || []).forEach(function (h) { h({ elementType: 'expressCheckout', availablePaymentMethods: methods }); });
      }, 50);
    },
    on: function (name, handler) { (walletHandlers[name] = walletHandlers[name] || []).push(handler); },
    off: function () {}, update: function () {}, unmount: function () {}, destroy: function () {},
  };
  window.__fireWallet = function (name) {
    var event = { expressPaymentType: window.__wallet === 'google' ? 'google_pay' : 'apple_pay', paymentFailed: function () { window.__paymentFailedCalls += 1; } };
    (walletHandlers[name] || []).forEach(function (h) { h(event); });
  };
  var answer = function (kind) {
    if (kind === 'declined') return { error: { type: 'card_error', code: 'card_declined', message: 'Tu tarjeta fue rechazada.' } };
    return { paymentIntent: { status: 'requires_capture' } };
  };
  window.__resolveConfirm = function (kind) { if (pending) { pending(answer(kind)); pending = null; } };
  return {
    elements: function () {
      return {
        create: function (type) { return type === 'expressCheckout' ? walletElement : cardElement; },
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
