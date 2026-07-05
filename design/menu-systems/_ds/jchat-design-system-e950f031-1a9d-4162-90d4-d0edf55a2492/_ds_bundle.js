/* @ds-bundle: {"format":3,"namespace":"JChatDesignSystem_e950f0","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Icon","sourcePath":"components/icon/Icon.jsx"},{"name":"ActivityBar","sourcePath":"components/place/ActivityBar.jsx"},{"name":"CategoryPill","sourcePath":"components/place/CategoryPill.jsx"},{"name":"PlaceRow","sourcePath":"components/place/PlaceRow.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"2a8758f3a6d4","components/core/Badge.jsx":"d553d38a6f82","components/core/Button.jsx":"bccfcbf04400","components/core/Card.jsx":"6f89ae3ef4c7","components/core/Chip.jsx":"1dca93731f03","components/core/Input.jsx":"c8a473508743","components/icon/Icon.jsx":"7c32a76248f8","components/place/ActivityBar.jsx":"a94eec3381e4","components/place/CategoryPill.jsx":"ba6658aed7a8","components/place/PlaceRow.jsx":"aa2561692cc2","ui_kits/mobile/app.jsx":"9e3919cd774b","ui_kits/mobile/data.js":"aef2e97b5ffd","ui_kits/mobile/ios-frame.jsx":"be3343be4b51","ui_kits/mobile/kit-map.jsx":"ba169610284d","ui_kits/mobile/kit-social.jsx":"6ee2722c21bb","ui_kits/mobile/kit-ui.jsx":"9c742efac033"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.JChatDesignSystem_e950f0 = window.JChatDesignSystem_e950f0 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * JChat Avatar — a rounded avatar. Defaults to the brand blue→purple gradient
 * with white initials (or an emoji / image). Optional online dot and verified
 * check. `square` uses a rounded-square (used for place/post avatars).
 */
function Avatar({
  initials,
  emoji,
  src,
  size = 46,
  color,
  square = false,
  online = false,
  verified = false,
  style,
  ...rest
}) {
  const radius = square ? size * 0.28 : '50%';
  const dotSize = Math.max(10, size * 0.26);
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      position: 'relative',
      display: 'inline-flex',
      flexShrink: 0,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: radius,
      background: color || 'var(--jc-gradient)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      color: '#fff',
      fontFamily: 'var(--jc-font-sans)',
      fontWeight: 'var(--jc-fw-heavy)',
      fontSize: size * 0.34
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: "",
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : emoji ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: size * 0.46
    }
  }, emoji) : initials), online ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: dotSize,
      height: dotSize,
      borderRadius: '50%',
      background: 'var(--jc-success)',
      border: '2px solid #fff'
    }
  }) : null, verified ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: dotSize + 2,
      height: dotSize + 2,
      borderRadius: '50%',
      background: 'var(--jc-success-deep)',
      border: '2px solid #fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: dotSize * 0.6,
      fontWeight: 700
    }
  }, "\u2713") : null);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * JChat Badge — a tinted status pill. Text in `color`, fill at ~9% of color,
 * border at ~25%. Use `tone` for the common semantic colors, or pass a custom
 * `color`. Matches the app's status labels (Permanent, Temporary, Verified…).
 */
const TONES = {
  blue: '#378ADD',
  green: '#0F766E',
  teal: '#0F766E',
  success: '#16A34A',
  warning: '#B45309',
  danger: '#B91C1C',
  purple: '#7C3AED',
  neutral: '#6B7280'
};
function Badge({
  children,
  tone = 'blue',
  color,
  dot = false,
  style,
  ...rest
}) {
  const c = color || TONES[tone] || TONES.blue;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 9px',
      fontSize: 10,
      fontFamily: 'var(--jc-font-sans)',
      fontWeight: 'var(--jc-fw-black)',
      textTransform: 'uppercase',
      letterSpacing: '0.4px',
      lineHeight: 1.1,
      borderRadius: 'var(--jc-radius-full)',
      color: c,
      background: `${c}18`,
      border: `var(--jc-hairline) solid ${c}40`,
      ...style
    }
  }, rest), dot ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: c
    }
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * JChat Button — verb-first CTA.
 * Variants:
 *  - primary  : solid navy #0D1B3E, white text (the app's main action)
 *  - gradient : blue→purple gradient (sign-in / hero action)
 *  - secondary: white with 0.5px hairline border, ink text
 *  - soft     : blue tint fill, blue text
 *  - ghost    : transparent, blue text (links/"use another option")
 * Sizes: sm | md | lg. Press = gentle opacity dip (no scale).
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon = null,
  block = false,
  disabled = false,
  onClick,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      padding: '8px 14px',
      fontSize: 13,
      radius: 'var(--jc-radius-md)',
      gap: 6
    },
    md: {
      padding: '12px 18px',
      fontSize: 14,
      radius: 'var(--jc-radius-lg)',
      gap: 6
    },
    lg: {
      padding: '14px 20px',
      fontSize: 15,
      radius: 'var(--jc-radius-lg)',
      gap: 8
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: 'var(--jc-navy)',
      color: '#fff',
      border: 'none'
    },
    gradient: {
      background: 'var(--jc-gradient)',
      color: '#fff',
      border: 'none'
    },
    secondary: {
      background: 'var(--jc-white)',
      color: 'var(--jc-ink)',
      border: 'var(--jc-hairline) solid var(--jc-line)'
    },
    soft: {
      background: 'var(--jc-tint-blue)',
      color: 'var(--jc-blue)',
      border: 'none'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--jc-blue)',
      border: 'none'
    }
  };
  const v = variants[variant] || variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: disabled ? undefined : onClick,
    disabled: disabled,
    style: {
      display: block ? 'flex' : 'inline-flex',
      width: block ? '100%' : 'auto',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      padding: s.padding,
      fontSize: s.fontSize,
      fontFamily: 'var(--jc-font-sans)',
      fontWeight: 'var(--jc-fw-semibold)',
      lineHeight: 1,
      borderRadius: s.radius,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'opacity var(--jc-dur-fast) var(--jc-ease)',
      WebkitTapHighlightColor: 'transparent',
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.opacity = '0.82';
    },
    onMouseUp: e => {
      if (!disabled) e.currentTarget.style.opacity = '1';
    },
    onMouseLeave: e => {
      if (!disabled) e.currentTarget.style.opacity = '1';
    }
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: s.fontSize + 2
    }
  }, icon) : null, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * JChat Card — the white, hairline-bordered surface used everywhere
 * (list rows, content cards). `pad` controls inner padding; `tint` swaps the
 * fill for a soft blue/green/grey wash (used for "map-first" and rule notes).
 */
const TINTS = {
  none: {
    background: 'var(--jc-white)',
    border: 'var(--jc-hairline) solid var(--jc-line)'
  },
  blue: {
    background: 'var(--jc-tint-blue-2)',
    border: 'var(--jc-border) solid #BFDBFE'
  },
  grey: {
    background: 'var(--jc-bg-soft)',
    border: 'var(--jc-hairline) solid var(--jc-line-2)'
  },
  green: {
    background: 'var(--jc-success-tint)',
    border: 'var(--jc-hairline) solid rgba(34,197,94,0.3)'
  }
};
function Card({
  children,
  tint = 'none',
  pad = 14,
  radius = 16,
  shadow = true,
  style,
  ...rest
}) {
  const t = TINTS[tint] || TINTS.none;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderRadius: radius,
      padding: pad,
      boxShadow: shadow && tint === 'none' ? 'var(--jc-shadow-sm)' : 'none',
      ...t,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * JChat filter Chip — segmented filter pill used on Messages / Nearby.
 * Active flips to navy fill + white text; inactive is a muted fill with
 * hairline border and grey text.
 */
function Chip({
  children,
  active = false,
  onClick,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '7px 13px',
      fontSize: 12,
      fontFamily: 'var(--jc-font-sans)',
      fontWeight: 'var(--jc-fw-black)',
      lineHeight: 1,
      borderRadius: 'var(--jc-radius-full)',
      cursor: 'pointer',
      transition: 'background var(--jc-dur-fast) var(--jc-ease), color var(--jc-dur-fast) var(--jc-ease)',
      background: active ? 'var(--jc-navy)' : 'var(--jc-fill-100)',
      color: active ? '#fff' : 'var(--jc-text-secondary)',
      border: active ? 'var(--jc-hairline) solid var(--jc-navy)' : 'var(--jc-hairline) solid transparent',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * JChat Input — labeled text field. The label is the signature uppercase,
 * tracked, grey micro-label. White field, hairline border, 12px radius; border
 * turns brand-blue on focus.
 */
function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  right,
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 11,
      fontWeight: 'var(--jc-fw-medium)',
      letterSpacing: 'var(--jc-ls-label)',
      textTransform: 'uppercase',
      color: 'var(--jc-label)',
      marginBottom: 6
    }
  }, label) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--jc-white)',
      border: `var(--jc-hairline) solid ${focused ? 'var(--jc-blue)' : 'var(--jc-line)'}`,
      borderRadius: 'var(--jc-radius-md)',
      padding: '0 14px',
      transition: 'border-color var(--jc-dur-fast) var(--jc-ease)'
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      padding: '12px 0',
      fontSize: 14,
      fontFamily: 'var(--jc-font-sans)',
      color: 'var(--jc-ink)'
    }
  }, rest)), right ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: 'var(--jc-text-secondary)'
    }
  }, right) : null));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/icon/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * JChat Icon — thin wrapper around Lucide (the system's web icon set).
 * Renders an <i data-lucide="name"> and asks Lucide to hydrate it on mount.
 * The host page must load Lucide once:
 *   <script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script>
 * Stroke is JChat-calm: 1.75 by default, currentColor so it inherits text color.
 */
function Icon({
  name,
  size = 22,
  stroke = 1.75,
  color = 'currentColor',
  style,
  ...rest
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (window.lucide && ref.current) {
      try {
        window.lucide.createIcons({
          nameAttr: 'data-lucide',
          icons: window.lucide.icons,
          attrs: {}
        });
      } catch (e) {}
    }
  });
  return /*#__PURE__*/React.createElement("i", _extends({
    ref: ref,
    "data-lucide": name,
    style: {
      display: 'inline-flex',
      width: size,
      height: size,
      color,
      ...style
    },
    "data-stroke": stroke
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icon/Icon.jsx", error: String((e && e.message) || e) }); }

// components/place/ActivityBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * JChat ActivityBar — the live-activity heat gradient (green→yellow→orange→red)
 * with optional Low / High end labels. Used in the Nearby header to legend the
 * map's activity radius colors.
 */
function ActivityBar({
  height = 8,
  labels = true,
  lowLabel = 'Low activity',
  highLabel = 'High activity',
  onDark = false,
  style,
  ...rest
}) {
  const labelColor = onDark ? 'rgba(255,255,255,0.35)' : 'var(--jc-text-muted)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: style
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      height,
      borderRadius: 'var(--jc-radius-full)',
      background: 'var(--jc-activity-bar)'
    }
  }), labels ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 'var(--jc-fw-heavy)',
      color: labelColor
    }
  }, lowLabel), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 'var(--jc-fw-heavy)',
      color: labelColor
    }
  }, highLabel)) : null);
}
Object.assign(__ds_scope, { ActivityBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/place/ActivityBar.jsx", error: String((e && e.message) || e) }); }

// components/place/CategoryPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CAT = {
  Bar: {
    c: '#EF4444',
    emoji: '🍺'
  },
  Cafe: {
    c: '#F97316',
    emoji: '☕'
  },
  Restaurant: {
    c: '#B7950B',
    emoji: '🍽️'
  },
  Gym: {
    c: '#16A34A',
    emoji: '💪'
  },
  Beauty: {
    c: '#A855F7',
    emoji: '💅'
  },
  Retail: {
    c: '#3B82F6',
    emoji: '🛍️'
  },
  Entertainment: {
    c: '#8B5CF6',
    emoji: '🎟️'
  },
  Hotel: {
    c: '#0D9488',
    emoji: '🏨'
  },
  Health: {
    c: '#059669',
    emoji: '🏥'
  },
  Other: {
    c: '#6B7280',
    emoji: '📍'
  }
};

/**
 * JChat CategoryPill — a tinted pill naming a business category, with its
 * canonical hue + emoji. Colored text on ~9% fill, ~25% border.
 */
function CategoryPill({
  category = 'Other',
  showEmoji = true,
  style,
  ...rest
}) {
  const m = CAT[category] || CAT.Other;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 9px',
      fontSize: 10,
      fontFamily: 'var(--jc-font-sans)',
      fontWeight: 'var(--jc-fw-semibold)',
      borderRadius: 'var(--jc-radius-full)',
      color: m.c,
      background: `${m.c}18`,
      border: `var(--jc-hairline) solid ${m.c}40`,
      ...style
    }
  }, rest), showEmoji ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11
    }
  }, m.emoji) : null, category);
}
Object.assign(__ds_scope, { CategoryPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/place/CategoryPill.jsx", error: String((e && e.message) || e) }); }

// components/place/PlaceRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ACTIVITY = {
  Low: '#378ADD',
  Medium: '#22C55E',
  High: '#F97316',
  Trending: '#EF4444'
};
const CAT_BG = {
  Bar: '#2A3060',
  Cafe: '#7B4700',
  Restaurant: '#9A3B12',
  Gym: '#1A5C3E',
  Beauty: '#5A2070',
  Retail: '#1A4A7A',
  Entertainment: '#3A1870',
  Hotel: '#1A3060',
  Health: '#1A5040',
  Other: '#2A2A4E'
};

/**
 * JChat PlaceRow — the "Trending places" list card from the Nearby screen.
 * Rank · emoji avatar · name · live activity dot+label · category pill.
 * `top` styles the #1 card with the green winner wash.
 */
function PlaceRow({
  name,
  emoji = '📍',
  category = 'Other',
  activity = 'Low',
  activeCount = 0,
  rank,
  top = false,
  onClick,
  style,
  ...rest
}) {
  const color = ACTIVITY[activity] || ACTIVITY.Low;
  const label = activity === 'Trending' ? 'Trending' : `${activity} activity`;
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      padding: '11px 13px',
      borderRadius: 'var(--jc-radius-lg)',
      background: top ? 'var(--jc-success-tint)' : 'var(--jc-white)',
      border: `var(--jc-hairline) solid ${top ? 'rgba(34,197,94,0.3)' : 'rgba(0,0,0,0.06)'}`,
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }
  }, rest), rank != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 'var(--jc-fw-medium)',
      color: 'var(--jc-text-muted)',
      minWidth: 16,
      textAlign: 'center'
    }
  }, top ? '👑' : rank) : null, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    emoji: emoji,
    square: true,
    color: CAT_BG[category] || CAT_BG.Other,
    size: 38
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 'var(--jc-fw-medium)',
      color: 'var(--jc-ink)',
      marginBottom: 3,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "jc-live-dot",
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: color
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 'var(--jc-fw-medium)',
      color
    }
  }, label, " \xB7 ", activeCount, " active"))), /*#__PURE__*/React.createElement(__ds_scope.CategoryPill, {
    category: category,
    showEmoji: false
  }));
}
Object.assign(__ds_scope, { PlaceRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/place/PlaceRow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile/app.jsx
try { (() => {
/* JChat mobile UI kit — app shell / navigation state machine */

function App() {
  const [stage, setStage] = React.useState('splash'); // splash | login | app
  const [tab, setTab] = React.useState('map');
  const [chatOpen, setChatOpen] = React.useState(false);
  let content;
  if (stage === 'splash') {
    content = /*#__PURE__*/React.createElement(SplashScreen, {
      onContinue: () => setStage('login')
    });
  } else if (stage === 'login') {
    content = /*#__PURE__*/React.createElement(LoginScreen, {
      onSignIn: () => {
        setStage('app');
        setTab('map');
      }
    });
  } else if (chatOpen) {
    content = /*#__PURE__*/React.createElement(ChatRoom, {
      onBack: () => setChatOpen(false)
    });
  } else {
    const screen = tab === 'map' ? /*#__PURE__*/React.createElement(MapScreen, {
      onJoin: () => setChatOpen(true)
    }) : tab === 'nearby' ? /*#__PURE__*/React.createElement(NearbyScreen, null) : tab === 'messages' ? /*#__PURE__*/React.createElement(MessagesScreen, {
      onOpenChat: () => setChatOpen(true)
    }) : /*#__PURE__*/React.createElement(ProfileScreen, null);
    content = /*#__PURE__*/React.createElement("div", {
      style: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minHeight: 0
      }
    }, screen), /*#__PURE__*/React.createElement(TabBar, {
      active: tab,
      onChange: setTab
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      background: '#EEF1F6'
    }
  }, /*#__PURE__*/React.createElement(IOSDevice, {
    dark: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%'
    }
  }, content)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile/data.js
try { (() => {
/* JChat mobile UI kit — demo data (plain globals, no JSX) */
window.JC_DATA = {
  businesses: [{
    id: 'lagoon',
    name: 'Blue Lagoon Bar',
    emoji: '🍺',
    category: 'Bar',
    activity: 'Trending',
    count: 27,
    desc: 'Rooftop cocktails · live DJ tonight',
    x: 58,
    y: 30,
    r: 150,
    open: true,
    gift: true
  }, {
    id: 'brew',
    name: 'Brew & Co.',
    emoji: '☕',
    category: 'Cafe',
    activity: 'High',
    count: 18,
    desc: 'Third-wave coffee & patio chatter',
    x: 26,
    y: 52,
    r: 120,
    open: true,
    gift: true
  }, {
    id: 'campus',
    name: 'Campus Fitness',
    emoji: '💪',
    category: 'Gym',
    activity: 'Medium',
    count: 11,
    desc: 'Open 24h · class in 20 min',
    x: 72,
    y: 64,
    r: 100,
    open: true,
    gift: false
  }, {
    id: 'pizza',
    name: 'Pizza Corner',
    emoji: '🍕',
    category: 'Restaurant',
    activity: 'Low',
    count: 8,
    desc: 'Wood-fired slices to share',
    x: 40,
    y: 76,
    r: 90,
    open: true,
    gift: true
  }, {
    id: 'market',
    name: 'Market Fresh',
    emoji: '🛒',
    category: 'Retail',
    activity: 'Low',
    count: 5,
    desc: 'Local grocer & juice bar',
    x: 84,
    y: 40,
    r: 80,
    open: false,
    gift: false
  }],
  // Blue Lagoon chat
  chat: {
    place: 'Blue Lagoon Bar',
    members: 8,
    people: [{
      id: 'lara',
      initials: 'LA',
      color: '#993556',
      badge: 'Verified',
      online: true
    }, {
      id: 'mario',
      initials: 'MR',
      color: '#0F6E56',
      badge: 'VIP',
      online: true
    }, {
      id: 'ana',
      initials: 'AN',
      color: '#185FA5',
      badge: 'Staff',
      online: true
    }, {
      id: 'devon',
      initials: 'DV',
      color: '#534AB7',
      online: false
    }, {
      id: 'kim',
      initials: 'KM',
      color: '#BA7517',
      online: true
    }],
    messages: [{
      type: 'system',
      text: "You're inside Blue Lagoon Bar. Say hi to people here right now."
    }, {
      id: 'lara',
      name: 'Lara',
      initials: 'LA',
      color: '#993556',
      text: 'anyone grabbing the patio table? 🍹',
      time: '9:32'
    }, {
      id: 'mario',
      name: 'Mario',
      initials: 'MR',
      color: '#0F6E56',
      text: 'on my way down, save a seat',
      time: '9:33'
    }, {
      type: 'gift',
      name: 'Mario',
      text: 'sent a gift to Lara 🎁',
      time: '9:34'
    }, {
      id: 'me',
      name: 'You',
      mine: true,
      text: 'haha nice. first round on the rooftop?',
      time: '9:35'
    }, {
      id: 'ana',
      name: 'Ana',
      initials: 'AN',
      color: '#185FA5',
      badge: 'Staff',
      text: 'VIP room QR is at the bar if you want in 🔑',
      time: '9:36'
    }]
  },
  conversations: [{
    id: 'c1',
    kind: 'group',
    title: 'Blue Lagoon Bar',
    sub: 'Local room · Bar',
    emoji: '🍺',
    color: '#2A3060',
    last: 'Ana: VIP room QR is at the bar…',
    time: 'now',
    status: 'Place',
    unread: 3
  }, {
    id: 'c2',
    kind: 'temporary',
    title: 'Mario',
    sub: 'Temporary place DM · Brew & Co.',
    initials: 'MR',
    color: '#1A2040',
    last: 'You: see you at the patio',
    time: '6h left',
    status: 'Temporary'
  }, {
    id: 'c3',
    kind: 'dm',
    title: 'Lara',
    sub: 'Permanent · met at Blue Lagoon',
    initials: 'LA',
    color: '#993556',
    last: 'Lara: that was such a fun night',
    time: '2h',
    status: 'Permanent',
    online: true,
    unread: 1
  }, {
    id: 'c4',
    kind: 'dm',
    title: 'Devon',
    sub: 'Permanent · met at Brew & Co.',
    initials: 'DV',
    color: '#534AB7',
    last: 'You: 👍',
    time: '1d',
    status: 'Permanent',
    online: false
  }, {
    id: 'c5',
    kind: 'group',
    title: 'Brew & Co.',
    sub: 'Local room · Cafe',
    emoji: '☕',
    color: '#7B4700',
    last: 'Enter inside the place to chat',
    time: '',
    status: 'Place'
  }],
  profile: {
    name: 'Jordan Rivera',
    username: '@jordan_r',
    initials: 'JR',
    bio: 'Coffee first ☕ · meet me out, not online. Davie, FL.',
    stats: {
      posts: 6,
      places: 3,
      friends: 12,
      orders: 4
    },
    badges: ['Verified user', 'Privacy controls on'],
    grid: [{
      emoji: '🍺',
      bg: ['#1A2040', '#2A3060']
    }, {
      emoji: '🌴',
      bg: ['#0F6E56', '#1D9E75']
    }, {
      emoji: '🍕',
      bg: ['#993556', '#D4537E']
    }, {
      emoji: '☕',
      bg: ['#BA7517', '#EF9F27']
    }, {
      emoji: '🎵',
      bg: ['#185FA5', '#378ADD']
    }, {
      emoji: '🌆',
      bg: ['#3C3489', '#534AB7']
    }],
    highlights: [{
      label: 'Cafés',
      emoji: '☕',
      color: '#7B4700'
    }, {
      label: 'Gym',
      emoji: '💪',
      color: '#1A5C3E'
    }, {
      label: 'Nights',
      emoji: '🍺',
      color: '#2A3060'
    }, {
      label: 'Gifts',
      emoji: '🎁',
      color: '#993556'
    }],
    visited: [{
      name: 'Brew & Co.',
      emoji: '☕',
      meta: 'Entered chat · 4 visits'
    }, {
      name: 'Blue Lagoon Bar',
      emoji: '🍺',
      meta: 'Entered chat · 2 visits'
    }, {
      name: 'Campus Fitness',
      emoji: '💪',
      meta: 'Entered chat · 1 visit'
    }]
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/data.js", error: String((e && e.message) || e) }); }

// ui_kits/mobile/ios-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/ios-frame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile/kit-map.jsx
try { (() => {
/* JChat mobile UI kit — Map screen + place bottom sheet */

function MapMarker({
  b,
  selected,
  onTap
}) {
  const hue = CAT_HUE[b.category] || '#6B7280';
  return /*#__PURE__*/React.createElement("div", {
    onClick: e => {
      e.stopPropagation();
      onTap(b);
    },
    style: {
      position: 'absolute',
      left: `${b.x}%`,
      top: `${b.y}%`,
      transform: 'translate(-50%,-50%)',
      cursor: 'pointer',
      zIndex: selected ? 6 : 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: selected ? 50 : 40,
      height: selected ? 50 : 40,
      borderRadius: '50%',
      border: `2.5px solid ${selected ? '#fff' : hue}`,
      background: selected ? hue : `${hue}22`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      transition: 'all .15s'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: selected ? 24 : 20
    }
  }, b.emoji), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -8,
      right: -9,
      minWidth: 22,
      height: 20,
      padding: '0 4px',
      borderRadius: 10,
      border: '2px solid #fff',
      background: ACT[b.activity],
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 9,
      color: '#fff',
      fontWeight: 900
    }
  }, b.count)), selected && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      background: 'rgba(10,15,40,0.88)',
      borderRadius: 8,
      padding: '3px 8px',
      maxWidth: 130
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      color: '#fff',
      textAlign: 'center',
      whiteSpace: 'nowrap'
    }
  }, b.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: '#B9D8FF',
      fontWeight: 700,
      textAlign: 'center'
    }
  }, b.count, " here"))));
}
function PlaceSheet({
  b,
  onClose,
  onJoin
}) {
  const hue = CAT_HUE[b.category];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      background: '#fff',
      borderRadius: '22px 22px 0 0',
      boxShadow: '0 -4px 14px rgba(0,0,0,0.14)',
      zIndex: 20,
      paddingBottom: 16,
      animation: 'jc-sheet-up .28s cubic-bezier(.22,1,.36,1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      display: 'flex',
      justifyContent: 'center',
      padding: '10px 0 6px',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 4,
      background: '#E0E2E7',
      borderRadius: 2
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      padding: '0 16px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: 16,
      background: `linear-gradient(135deg, ${CAT_BG[b.category]}, #0D1B3E)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 28
    }
  }, b.emoji)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 600,
      color: '#1A1A2E',
      marginBottom: 6
    }
  }, b.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Pill, {
    color: hue
  }, b.category), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      color: '#22C55E',
      fontWeight: 500
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 3,
      background: '#22C55E'
    }
  }), b.open ? 'Open now' : 'Closed'), /*#__PURE__*/React.createElement(Pill, {
    color: ACT[b.activity]
  }, b.activity, " \xB7 ", b.count, " here")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#6B7280',
      lineHeight: 1.4
    }
  }, b.desc), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 7,
      borderRadius: 12,
      padding: '8px 10px',
      border: '0.5px solid #BFDBFE',
      background: '#E6F1FB'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#378ADD',
      fontWeight: 900
    }
  }, "12m away \xB7 device inside radius"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#9CA3AF',
      fontWeight: 700,
      marginTop: 3
    }
  }, "Live chat unlocks once JChat verifies your location.")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      padding: '0 16px',
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onJoin(b),
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      background: '#0D1B3E',
      color: '#fff',
      border: 'none',
      borderRadius: 14,
      padding: '12px 0',
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'var(--jc-font-sans)'
    }
  }, "\u25A2 Join chat"), [['ⓘ', 'Info'], b.gift ? ['▦', 'Menu'] : null, ['⌖', 'Go']].filter(Boolean).map(([ic, lb]) => /*#__PURE__*/React.createElement("button", {
    key: lb,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      background: '#F7F8FA',
      border: '0.5px solid #E0E2E7',
      borderRadius: 14,
      padding: '8px 12px',
      fontSize: 10,
      color: '#6B7280',
      fontWeight: 500,
      cursor: 'pointer',
      fontFamily: 'var(--jc-font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17
    }
  }, ic), lb))));
}
function MapScreen({
  onJoin
}) {
  const [selected, setSelected] = React.useState(null);
  const [cat, setCat] = React.useState('All');
  const cats = ['All', 'Trending', 'Bar', 'Cafe', 'Restaurant', 'Gym'];
  const businesses = JC_DATA.businesses;
  return /*#__PURE__*/React.createElement("div", {
    onClick: () => setSelected(null),
    style: {
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      background: '#E7ECDF'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '34%',
      height: 16,
      background: '#fff',
      opacity: 0.85
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '68%',
      height: 22,
      background: '#fff',
      opacity: 0.85
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '30%',
      width: 16,
      background: '#fff',
      opacity: 0.85
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '74%',
      width: 18,
      background: '#fff',
      opacity: 0.85
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'radial-gradient(120% 80% at 50% 30%, rgba(231,236,223,0), rgba(214,223,201,0.5))'
    }
  })), businesses.map(b => {
    const muted = cat !== 'All' && cat !== 'Trending' && b.category !== cat;
    const hue = ACT[b.activity];
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        position: 'absolute',
        left: `${b.x}%`,
        top: `${b.y}%`,
        transform: 'translate(-50%,-50%)',
        width: b.r,
        height: b.r,
        borderRadius: '50%',
        background: muted ? 'rgba(140,150,160,0.12)' : `${hue}26`,
        border: `2px solid ${muted ? 'rgba(140,150,160,0.3)' : hue + '66'}`,
        zIndex: 2
      }
    });
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: '48%',
      top: '46%',
      transform: 'translate(-50%,-50%)',
      zIndex: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 16,
      background: 'rgba(55,138,221,0.22)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 16,
      height: 16,
      borderRadius: 8,
      background: '#378ADD',
      border: '3px solid #fff'
    }
  }))), businesses.map(b => {
    const muted = cat !== 'All' && cat !== 'Trending' && b.category !== cat;
    if (muted) return null;
    return /*#__PURE__*/React.createElement(MapMarker, {
      key: b.id,
      b: b,
      selected: selected?.id === b.id,
      onTap: setSelected
    });
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 8,
      padding: `${STATUSBAR}px 12px 10px`,
      background: 'linear-gradient(180deg, rgba(13,27,62,0.55), rgba(13,27,62,0))'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: '#fff',
      borderRadius: 14,
      padding: '11px 13px',
      boxShadow: '0 6px 16px rgba(13,27,62,0.18)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: '#6B7280'
    }
  }, "\u2315"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#9CA3AF',
      fontWeight: 600
    }
  }, "Search places anywhere\u2026")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7,
      marginTop: 9,
      overflowX: 'auto'
    }
  }, cats.map(c => {
    const on = cat === c;
    return /*#__PURE__*/React.createElement("button", {
      key: c,
      onClick: () => setCat(c),
      style: {
        flexShrink: 0,
        border: 'none',
        cursor: 'pointer',
        borderRadius: 999,
        padding: '7px 13px',
        fontSize: 12,
        fontWeight: 900,
        fontFamily: 'var(--jc-font-sans)',
        background: on ? '#0D1B3E' : 'rgba(255,255,255,0.92)',
        color: on ? '#fff' : '#374151'
      }
    }, c);
  }))), !selected && /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      left: 12,
      bottom: 16,
      zIndex: 7,
      background: 'rgba(13,27,62,0.9)',
      borderRadius: 12,
      padding: '9px 11px',
      width: 150
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: 'rgba(255,255,255,0.6)',
      fontWeight: 900,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: 6
    }
  }, "Live activity"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 7,
      borderRadius: 999,
      background: 'var(--jc-activity-bar)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: 'rgba(255,255,255,0.5)',
      fontWeight: 700
    }
  }, "Low"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      color: 'rgba(255,255,255,0.5)',
      fontWeight: 700
    }
  }, "High"))), !selected && /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      right: 12,
      bottom: 16,
      zIndex: 7,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, ['＋', '－', '⌖'].map(t => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      width: 46,
      height: 46,
      borderRadius: 14,
      background: '#fff',
      boxShadow: '0 4px 12px rgba(13,27,62,0.18)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      color: '#0D1B3E',
      fontWeight: 700
    }
  }, t))), selected && /*#__PURE__*/React.createElement(PlaceSheet, {
    b: selected,
    onClose: () => setSelected(null),
    onJoin: onJoin
  }));
}
Object.assign(window, {
  MapScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/kit-map.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile/kit-social.jsx
try { (() => {
/* JChat mobile UI kit — Nearby, Messages, ChatRoom, Profile */

function ScreenHeader({
  title,
  sub,
  right,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#0D1B3E',
      padding: `${STATUSBAR}px 16px 14px`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 800,
      color: '#fff'
    }
  }, title), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.5)',
      marginTop: 3
    }
  }, sub)), right), children);
}

/* ───────── Nearby ───────── */
function NearbyScreen() {
  const list = JC_DATA.businesses.slice().sort((a, b) => b.count - a.count);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      background: '#F7F8FA',
      overflow: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#0D1B3E',
      padding: `${STATUSBAR}px 16px 16px`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 500,
      color: '#fff'
    }
  }, "Live activity"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: 'rgba(55,138,221,0.2)',
      border: '0.5px solid rgba(55,138,221,0.4)',
      borderRadius: 20,
      padding: '4px 10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 3,
      background: '#378ADD'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: '#63B3ED'
    }
  }, "Within 500m"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: 4,
      background: 'var(--jc-activity-bar)',
      marginBottom: 4
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.35)'
    }
  }, "Low activity"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.35)'
    }
  }, "High activity"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '14px 16px 8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "jc-live-dot",
    style: {
      width: 8,
      height: 8,
      borderRadius: 4,
      background: '#22C55E'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: '#1A1A2E'
    }
  }, "Live"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#6B7280'
    }
  }, "places near your radius"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(55,138,221,0.1)',
      borderRadius: 20,
      padding: '3px 9px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 5,
      height: 5,
      borderRadius: 3,
      background: '#378ADD'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: '#378ADD'
    }
  }, list.length, " nearby"))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '2px 12px 8px',
      background: '#F0F7FF',
      border: '1px solid #BFDBFE',
      borderRadius: 14,
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#0D1B3E',
      fontWeight: 900,
      marginBottom: 3
    }
  }, "The map comes first"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#185FA5',
      lineHeight: 1.4,
      fontWeight: 700
    }
  }, "Trending is calculated from people inside each place right now. Open the map to join a chat.")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#6B7280',
      letterSpacing: '1px',
      textTransform: 'uppercase',
      fontWeight: 800,
      padding: '4px 16px 8px'
    }
  }, "Trending places"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '0 12px 8px'
    }
  }, list.map((b, i) => {
    const top = i === 0;
    return /*#__PURE__*/React.createElement("div", {
      key: b.id,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '11px 13px',
        borderRadius: 14,
        background: top ? '#F0FDF4' : '#fff',
        border: `0.5px solid ${top ? 'rgba(34,197,94,0.3)' : 'rgba(0,0,0,0.06)'}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 500,
        color: '#9CA3AF',
        minWidth: 16,
        textAlign: 'center'
      }
    }, top ? '👑' : i + 1), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 38,
        height: 38,
        borderRadius: 10,
        background: `linear-gradient(135deg, ${CAT_BG[b.category]}, #0D1B3E)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 20
      }
    }, b.emoji)), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 500,
        color: '#1A1A2E',
        marginBottom: 3
      }
    }, b.name), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 5
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "jc-live-dot",
      style: {
        width: 6,
        height: 6,
        borderRadius: 3,
        background: ACT[b.activity]
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 500,
        color: ACT[b.activity]
      }
    }, b.activity === 'Trending' ? 'Trending' : b.activity + ' activity', " \xB7 ", b.count, " active"))), /*#__PURE__*/React.createElement(Pill, {
      color: CAT_HUE[b.category]
    }, b.category));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#6B7280',
      letterSpacing: '1px',
      textTransform: 'uppercase',
      fontWeight: 800,
      padding: '8px 16px'
    }
  }, "Place photos"), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '0 12px 20px',
      background: '#fff',
      borderRadius: 16,
      border: '0.5px solid rgba(0,0,0,0.06)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 12,
      background: '#7B4700',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 20
    }
  }, "\u2615"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 800,
      color: '#1A1A2E'
    }
  }, "Brew & Co."), /*#__PURE__*/React.createElement(Pill, {
    color: "#378ADD",
    style: {
      padding: '2px 7px'
    }
  }, "Place")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#6B7280',
      marginTop: 1
    }
  }, "Tagged at Brew & Co.")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16,
      color: '#9CA3AF',
      fontWeight: 900
    }
  }, "\u2022\u2022\u2022")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 180,
      background: 'linear-gradient(135deg, #7B4700, #0D1B3E)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 64
    }
  }, "\u2615"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      fontSize: 19,
      color: '#0D1B3E',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u2661"), /*#__PURE__*/React.createElement("span", null, "\uD83D\uDCAC"), /*#__PURE__*/React.createElement("span", null, "\u2197")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 800,
      color: '#1A1A2E',
      marginBottom: 3
    }
  }, "42 likes \xB7 8 comments"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: '#374151',
      lineHeight: 1.45
    }
  }, "Iced lattes are moving fast. Patio chat is warming up."))));
}

/* ───────── Messages ───────── */
function MessagesScreen({
  onOpenChat
}) {
  const [filter, setFilter] = React.useState('all');
  const filters = [['all', 'All'], ['dm', 'Friends'], ['temporary', 'Temporary'], ['group', 'Places']];
  const convos = JC_DATA.conversations.filter(c => filter === 'all' || c.kind === filter);
  const totalUnread = JC_DATA.conversations.reduce((a, c) => a + (c.unread || 0), 0);
  const counts = {
    friends: JC_DATA.conversations.filter(c => c.kind === 'dm').length,
    temporary: JC_DATA.conversations.filter(c => c.kind === 'temporary').length,
    places: JC_DATA.conversations.filter(c => c.kind === 'group').length
  };
  const statusColor = s => s === 'Temporary' ? {
    c: '#9A3412',
    bg: '#FFEDD5'
  } : s === 'Permanent' ? {
    c: '#0F766E',
    bg: '#DDFBF4'
  } : {
    c: '#378ADD',
    bg: '#E6F1FB'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      background: '#fff',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(ScreenHeader, {
    title: "Messages",
    sub: "Friends, temporary & place chats",
    right: /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }
    }, totalUnread > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        background: '#EF4444',
        borderRadius: 10,
        padding: '2px 7px',
        fontSize: 11,
        fontWeight: 700,
        color: '#fff'
      }
    }, totalUnread), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 32,
        height: 32,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 900
      }
    }, "\u24D8"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      padding: '10px 12px 8px',
      borderBottom: '0.5px solid #E8EAED'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: '#F3F4F6',
      borderRadius: 999,
      padding: '9px 12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: '#6B7280'
    }
  }, "\u2315"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#9CA3AF'
    }
  }, "Search messages")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 9,
      overflowX: 'auto'
    }
  }, filters.map(([k, l]) => {
    const on = filter === k;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setFilter(k),
      style: {
        flexShrink: 0,
        border: 'none',
        cursor: 'pointer',
        borderRadius: 999,
        padding: '7px 13px',
        fontSize: 12,
        fontWeight: 900,
        fontFamily: 'var(--jc-font-sans)',
        background: on ? '#0D1B3E' : '#F3F4F6',
        color: on ? '#fff' : '#6B7280'
      }
    }, l);
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9,
      padding: '12px 16px 0'
    }
  }, [['friends', counts.friends], ['temporary', counts.temporary], ['places', counts.places]].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      flex: 1,
      borderRadius: 16,
      background: '#F8FAFC',
      border: '0.5px solid #E5E7EB',
      padding: '10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 18,
      color: '#0D1B3E',
      fontWeight: 900
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: '#6B7280',
      fontWeight: 900,
      textTransform: 'uppercase',
      marginTop: 2
    }
  }, k)))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '12px 16px 4px',
      borderRadius: 14,
      background: '#F8FAFC',
      border: '0.5px solid #E5E7EB',
      padding: '9px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#64748B',
      lineHeight: 1.35,
      fontWeight: 800
    }
  }, "Friends are only discovered inside a shared place chat. No random DMs.")), convos.map(c => {
    const sc = statusColor(c.status);
    return /*#__PURE__*/React.createElement("div", {
      key: c.id,
      onClick: () => c.kind === 'group' && onOpenChat(),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 16px',
        borderBottom: '0.5px solid #F3F4F6',
        background: c.kind === 'temporary' ? '#FFFBF5' : '#fff',
        cursor: c.kind === 'group' ? 'pointer' : 'default'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 46,
        height: 46,
        borderRadius: 23,
        background: c.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 800,
        fontSize: c.emoji ? 20 : 14
      }
    }, c.emoji || c.initials), c.online && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 12,
        height: 12,
        borderRadius: 6,
        background: '#22C55E',
        border: '2px solid #fff'
      }
    }), c.kind === 'temporary' && /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 12,
        height: 12,
        borderRadius: 6,
        background: '#EF9F27',
        border: '2px solid #fff'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 800,
        color: '#1A1A2E'
      }
    }, c.title), c.time && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: c.unread ? '#378ADD' : '#9CA3AF',
        fontWeight: c.unread ? 700 : 400
      }
    }, c.time)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        color: '#6B7280',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }
    }, c.last), c.unread ? /*#__PURE__*/React.createElement("span", {
      style: {
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        background: '#378ADD',
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 5px'
      }
    }, c.unread) : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 900,
        borderRadius: 999,
        padding: '4px 8px',
        color: sc.c,
        background: sc.bg
      }
    }, c.status)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 4
      }
    }, c.sub)));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 12
    }
  })));
}

/* ───────── Chat room ───────── */
function ChatRoom({
  onBack
}) {
  const c = JC_DATA.chat;
  const [text, setText] = React.useState('');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      background: '#F7F8FA',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#0D1B3E',
      padding: `${STATUSBAR}px 16px 12px`,
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    onClick: onBack,
    style: {
      fontSize: 26,
      color: '#fff',
      cursor: 'pointer',
      lineHeight: 1
    }
  }, "\u2039"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: '#fff'
    }
  }, c.place), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "jc-live-dot",
    style: {
      width: 6,
      height: 6,
      borderRadius: 3,
      background: '#22C55E'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.5)'
    }
  }, c.members, " here now"))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 20,
      color: '#fff',
      fontWeight: 900
    }
  }, "\u22EF")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      padding: '10px 14px',
      background: '#fff',
      borderBottom: '0.5px solid #E8EAED',
      overflowX: 'auto'
    }
  }, c.people.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: 22,
      background: p.color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 800,
      fontSize: 14
    }
  }, p.initials), p.online && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 11,
      height: 11,
      borderRadius: 6,
      background: '#22C55E',
      border: '2px solid #fff'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '14px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, c.messages.map((m, i) => {
    if (m.type === 'system') return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        alignSelf: 'center',
        maxWidth: '85%',
        textAlign: 'center',
        fontSize: 11,
        color: '#64748B',
        background: '#EEF2F7',
        borderRadius: 10,
        padding: '8px 12px',
        fontWeight: 700
      }
    }, m.text);
    if (m.type === 'gift') return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: '#7C3AED',
        background: '#F5F3FF',
        border: '0.5px solid #DDD6FE',
        borderRadius: 999,
        padding: '6px 12px',
        fontWeight: 800
      }
    }, "\uD83C\uDF81 ", m.name, " ", m.text);
    if (m.mine) return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        alignSelf: 'flex-end',
        maxWidth: '78%'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#378ADD',
        color: '#fff',
        borderRadius: '14px 14px 4px 14px',
        padding: '9px 12px',
        fontSize: 13,
        lineHeight: 1.4
      }
    }, m.text), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: '#9CA3AF',
        textAlign: 'right',
        marginTop: 3
      }
    }, m.time));
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        alignSelf: 'flex-start',
        maxWidth: '82%',
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 30,
        height: 30,
        borderRadius: 15,
        background: m.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 800,
        fontSize: 11,
        flexShrink: 0,
        marginTop: 2
      }
    }, m.initials), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 3
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        fontWeight: 800,
        color: '#374151'
      }
    }, m.name), m.badge && /*#__PURE__*/React.createElement(Pill, {
      color: m.badge === 'Staff' ? '#0F6E56' : '#378ADD',
      style: {
        padding: '1px 6px',
        fontSize: 8
      }
    }, m.badge)), /*#__PURE__*/React.createElement("div", {
      style: {
        background: '#fff',
        border: '0.5px solid #E0E2E7',
        borderRadius: '14px 14px 14px 4px',
        padding: '9px 12px',
        fontSize: 13,
        color: '#1A1A2E',
        lineHeight: 1.4
      }
    }, m.text), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: '#9CA3AF',
        marginTop: 3
      }
    }, m.time)));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: '#fff',
      borderTop: '0.5px solid #E0E2E7',
      padding: '10px 12px 22px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 22,
      color: '#9CA3AF'
    }
  }, "\uFF0B"), /*#__PURE__*/React.createElement("input", {
    value: text,
    onChange: e => setText(e.target.value),
    placeholder: "Message people here\u2026",
    style: {
      flex: 1,
      background: '#F7F8FA',
      borderRadius: 20,
      padding: '9px 14px',
      fontSize: 13,
      color: '#1A1A2E',
      border: '0.5px solid #E0E2E7',
      outline: 'none',
      fontFamily: 'var(--jc-font-sans)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 17,
      background: text ? '#378ADD' : '#E5E7EB',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 16,
      fontWeight: 900
    }
  }, "\u27A4")));
}

/* ───────── Profile ───────── */
function ProfileScreen() {
  const p = JC_DATA.profile;
  const [tab, setTab] = React.useState('posts');
  const tabs = [['posts', 'Posts', '⊞'], ['places', 'Places', '⌖'], ['gifts', 'Gifts', '◇'], ['history', 'History', '◷']];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      background: '#fff',
      overflow: 'auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#0D1B3E',
      padding: `${STATUSBAR}px 16px 20px`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: '#fff'
    }
  }, p.username), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      fontSize: 22,
      color: '#fff',
      fontWeight: 900
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u25CE"), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative'
    }
  }, "\u25CC", /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 8,
      height: 8,
      borderRadius: 4,
      background: '#EF4444',
      border: '1.5px solid #0D1B3E'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 72,
      height: 72,
      borderRadius: 36,
      background: 'var(--jc-gradient)',
      border: '3px solid rgba(255,255,255,0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 24,
      fontWeight: 500
    }
  }, p.initials), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 20,
      height: 20,
      borderRadius: 10,
      background: '#1D9E75',
      border: '2px solid #0D1B3E',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700
    }
  }, "\u2713")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 500,
      color: '#fff',
      marginBottom: 2
    }
  }, p.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.5)'
    }
  }, p.username))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      marginBottom: 12
    }
  }, [['posts', 'Posts'], ['places', 'Places'], ['friends', 'Friends'], ['orders', 'Orders']].map(([k, l], i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: k
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: '0.5px',
      background: 'rgba(255,255,255,0.1)',
      margin: '4px 0'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 500,
      color: '#fff'
    }
  }, p.stats[k]), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.5)',
      marginTop: 1
    }
  }, l))))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.6)',
      lineHeight: 1.5,
      marginBottom: 12
    }
  }, p.bio), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7,
      flexWrap: 'wrap',
      marginBottom: 12
    }
  }, p.badges.map(b => /*#__PURE__*/React.createElement("span", {
    key: b,
    style: {
      fontSize: 10,
      color: '#B9D8FF',
      background: 'rgba(55,138,221,0.16)',
      border: '0.5px solid rgba(55,138,221,0.35)',
      borderRadius: 999,
      padding: '4px 8px',
      fontWeight: 900
    }
  }, b))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: '9px 0',
      background: 'rgba(255,255,255,0.1)',
      border: '0.5px solid rgba(255,255,255,0.2)',
      borderRadius: 10,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: 500,
      color: '#fff'
    }
  }, "Edit profile"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      background: 'rgba(255,255,255,0.1)',
      border: '0.5px solid rgba(255,255,255,0.2)',
      borderRadius: 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 16
    }
  }, "\u2197"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      padding: 14,
      borderBottom: '0.5px solid #E0E2E7',
      overflowX: 'auto'
    }
  }, p.highlights.map(h => /*#__PURE__*/React.createElement("div", {
    key: h.label,
    style: {
      width: 62,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 5,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 58,
      height: 58,
      borderRadius: 29,
      background: h.color,
      border: '3px solid #E6F1FB',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 22
    }
  }, h.emoji), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: '#4B5563',
      fontWeight: 800
    }
  }, h.label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      borderBottom: '0.5px solid #E0E2E7'
    }
  }, tabs.map(([k, l, ic]) => {
    const on = tab === k;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setTab(k),
      style: {
        flex: 1,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: '11px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        borderBottom: `2px solid ${on ? '#0D1B3E' : 'transparent'}`,
        fontFamily: 'var(--jc-font-sans)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16,
        color: on ? '#0D1B3E' : '#AAA'
      }
    }, ic), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: on ? '#0D1B3E' : '#AAA',
        fontWeight: on ? 500 : 400
      }
    }, l));
  })), tab === 'posts' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 1.5
    }
  }, p.grid.map((g, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      aspectRatio: '1',
      background: `linear-gradient(135deg, ${g.bg[0]}, ${g.bg[1]})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 28
    }
  }, g.emoji))), tab === 'places' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#F0F7FF',
      color: '#185FA5',
      borderRadius: 14,
      padding: 12,
      fontSize: 12,
      fontWeight: 800,
      lineHeight: 1.4
    }
  }, "Places you've physically entered. You control who can see this log."), p.visited.map(v => /*#__PURE__*/React.createElement("div", {
    key: v.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: '#fff',
      borderRadius: 16,
      padding: 12,
      border: '0.5px solid #E8EAED'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 24
    }
  }, v.emoji), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: '#1A1A2E',
      fontWeight: 800
    }
  }, v.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#6B7280',
      fontWeight: 700,
      marginTop: 2
    }
  }, v.meta))))), (tab === 'gifts' || tab === 'history') && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '60px 16px',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 42,
      color: '#9CA3AF',
      marginBottom: 12,
      fontWeight: 900
    }
  }, tab === 'gifts' ? '◇' : '◷'), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      color: '#9CA3AF'
    }
  }, tab === 'gifts' ? 'No gifts received yet' : 'No order history yet')), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 20
    }
  }));
}
Object.assign(window, {
  NearbyScreen,
  MessagesScreen,
  ChatRoom,
  ProfileScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/kit-social.jsx", error: String((e && e.message) || e) }); }

// ui_kits/mobile/kit-ui.jsx
try { (() => {
/* JChat mobile UI kit — shared helpers, Splash, Login, TabBar */

const STATUSBAR = 56; // clearance under the dynamic island
const ACT = {
  Low: '#378ADD',
  Medium: '#22C55E',
  High: '#F97316',
  Trending: '#EF4444'
};
const CAT_HUE = {
  Bar: '#EF4444',
  Cafe: '#F97316',
  Restaurant: '#B7950B',
  Gym: '#16A34A',
  Beauty: '#A855F7',
  Retail: '#3B82F6',
  Entertainment: '#8B5CF6',
  Hotel: '#0D9488',
  Health: '#059669',
  Other: '#6B7280'
};
const CAT_BG = {
  Bar: '#2A3060',
  Cafe: '#7B4700',
  Restaurant: '#9A3B12',
  Gym: '#1A5C3E',
  Beauty: '#5A2070',
  Retail: '#1A4A7A',
  Entertainment: '#3A1870',
  Hotel: '#1A3060',
  Health: '#1A5040',
  Other: '#2A2A4E'
};

/* Small tinted pill */
function Pill({
  children,
  color = '#378ADD',
  solid = false,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 9px',
      fontSize: 10,
      fontWeight: 900,
      borderRadius: 999,
      lineHeight: 1.2,
      color: solid ? '#fff' : color,
      background: solid ? color : `${color}18`,
      border: `0.5px solid ${solid ? color : color + '40'}`,
      ...style
    }
  }, children);
}

/* Gradient pin logo */
function PinLogo({
  size = 64
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: size / 2,
      background: 'var(--jc-gradient)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/jchat-pin.svg",
    alt: "",
    style: {
      width: '64%',
      height: '64%'
    }
  }));
}

/* ───────────────────────── Splash ───────────────────────── */
function SplashScreen({
  onContinue
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onContinue,
    style: {
      height: '100%',
      background: 'var(--jc-navy)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 200,
      height: 200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 36
    }
  }, [180, 130, 86].map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: s,
    className: "jc-radar",
    style: {
      position: 'absolute',
      width: s,
      height: s,
      borderRadius: '50%',
      border: '1px solid rgba(99,179,237,0.35)',
      animationDelay: `${i * 0.6}s`
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      width: 64,
      height: 64,
      borderRadius: 32,
      background: 'rgba(55,138,221,0.4)',
      filter: 'blur(2px)'
    },
    className: "jc-glow"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement(PinLogo, {
    size: 64
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 34,
      fontWeight: 500,
      color: '#fff',
      letterSpacing: '-0.5px',
      marginBottom: 8
    }
  }, "JChat"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.4)',
      letterSpacing: '2px',
      textTransform: 'uppercase'
    }
  }, "Connect where you are"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 84,
      width: 80,
      height: 3,
      background: 'rgba(255,255,255,0.1)',
      borderRadius: 2,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "jc-shimmer",
    style: {
      width: 48,
      height: 3,
      background: '#378ADD',
      borderRadius: 2
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 54,
      color: 'rgba(255,255,255,0.42)',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: '1.2px',
      textTransform: 'uppercase'
    }
  }, "Tap to continue"));
}

/* ───────────────────────── Login ───────────────────────── */
function LoginScreen({
  onSignIn
}) {
  const [focus, setFocus] = React.useState(null);
  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 500,
    color: '#888',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    marginBottom: 6
  };
  const inputBox = key => ({
    display: 'flex',
    alignItems: 'center',
    background: '#fff',
    border: `0.5px solid ${focus === key ? '#378ADD' : '#E0E2E7'}`,
    borderRadius: 12,
    padding: '0 14px',
    marginBottom: 12
  });
  const inputEl = {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: '12px 0',
    fontSize: 14,
    color: '#1A1A2E',
    fontFamily: 'var(--jc-font-sans)'
  };
  const social = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    background: '#fff',
    border: '0.5px solid #E0E2E7',
    borderRadius: 12,
    padding: '11px 8px',
    fontSize: 13,
    fontWeight: 500,
    color: '#1A1A2E',
    opacity: 0.48
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      background: 'var(--jc-navy)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: STATUSBAR + 18,
      paddingBottom: 28,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(PinLogo, {
    size: 48
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 500,
      color: '#fff',
      marginTop: 14,
      marginBottom: 4,
      whiteSpace: 'nowrap'
    }
  }, "Welcome back"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.45)'
    }
  }, "Sign in to return to the map")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: '#F7F8FA',
      borderRadius: '28px 28px 38px 38px',
      padding: '24px 20px',
      overflow: 'auto'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: labelStyle
  }, "Email"), /*#__PURE__*/React.createElement("div", {
    style: inputBox('email')
  }, /*#__PURE__*/React.createElement("input", {
    style: inputEl,
    placeholder: "you@example.com",
    defaultValue: "jordan@example.com",
    onFocus: () => setFocus('email'),
    onBlur: () => setFocus(null)
  })), /*#__PURE__*/React.createElement("span", {
    style: labelStyle
  }, "Password"), /*#__PURE__*/React.createElement("div", {
    style: inputBox('pwd')
  }, /*#__PURE__*/React.createElement("input", {
    style: inputEl,
    type: "password",
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    defaultValue: "password",
    onFocus: () => setFocus('pwd'),
    onBlur: () => setFocus(null)
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16
    }
  }, "\uD83D\uDC41")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: '#378ADD',
      textAlign: 'right',
      marginBottom: 16
    }
  }, "Forgot password?"), /*#__PURE__*/React.createElement("button", {
    onClick: onSignIn,
    style: {
      width: '100%',
      border: 'none',
      borderRadius: 14,
      padding: '14px 0',
      cursor: 'pointer',
      background: 'var(--jc-gradient)',
      color: '#fff',
      fontSize: 15,
      fontWeight: 500,
      marginBottom: 20,
      fontFamily: 'var(--jc-font-sans)'
    }
  }, "Sign in"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: '0.5px',
      background: '#E0E2E7'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: '#BBB'
    }
  }, "or continue with"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: '0.5px',
      background: '#E0E2E7'
    }
  })), /*#__PURE__*/React.createElement("button", {
    onClick: onSignIn,
    style: {
      width: '100%',
      borderRadius: 12,
      padding: '11px 0',
      marginBottom: 14,
      cursor: 'pointer',
      background: '#FFF7E6',
      border: '1px solid #F59E0B',
      color: '#B45309',
      fontSize: 13,
      fontWeight: 600,
      fontFamily: 'var(--jc-font-sans)'
    }
  }, "\uD83D\uDE80 Continue in demo mode"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...social,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#4285F4'
    }
  }, "G"), " Google \u2014 coming soon"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...social,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#1877F2'
    }
  }, "f"), " Facebook"), /*#__PURE__*/React.createElement("div", {
    style: {
      ...social,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: '#0072C6'
    }
  }, "M"), " Outlook")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      gap: 5,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#888'
    }
  }, "New to JChat?"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: '#378ADD'
    }
  }, "Sign up"))));
}

/* ───────────────────────── Tab bar ───────────────────────── */
function TabBar({
  active,
  onChange
}) {
  const tabs = [{
    key: 'map',
    label: 'Map',
    icon: '⌖'
  }, {
    key: 'nearby',
    label: 'Nearby',
    icon: '◉'
  }, {
    key: 'messages',
    label: 'DMs',
    icon: '◇'
  }, {
    key: 'profile',
    label: 'Profile',
    icon: '◍'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      background: '#fff',
      borderTop: '0.5px solid #E0E2E7',
      paddingBottom: 22,
      paddingTop: 8
    }
  }, tabs.map(t => {
    const on = active === t.key;
    return /*#__PURE__*/React.createElement("button", {
      key: t.key,
      onClick: () => onChange(t.key),
      style: {
        flex: 1,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        color: on ? '#378ADD' : 'rgba(13,27,62,0.4)',
        fontFamily: 'var(--jc-font-sans)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 20,
        lineHeight: 1,
        fontWeight: 900
      }
    }, t.icon), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: on ? 700 : 500
      }
    }, t.label));
  }));
}
Object.assign(window, {
  STATUSBAR,
  ACT,
  CAT_HUE,
  CAT_BG,
  Pill,
  PinLogo,
  SplashScreen,
  LoginScreen,
  TabBar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/mobile/kit-ui.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.ActivityBar = __ds_scope.ActivityBar;

__ds_ns.CategoryPill = __ds_scope.CategoryPill;

__ds_ns.PlaceRow = __ds_scope.PlaceRow;

})();
