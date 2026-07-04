// Card hover-effect system — moved verbatim from MenuPageClient.
// Shared by the menu item cards across templates.

export type CardEffect =
  | "lift"
  | "reveal"
  | "tilt"
  | "spotlight"
  | "duotone"
  | "glass"
  | "shine"
  | "focus"
  | "neon"
  | "polaroid";

type EffectStyles = {
  cardStyle: React.CSSProperties;
  photoWrapStyle: React.CSSProperties;
  imgStyle: React.CSSProperties;
  overlayStyle: React.CSSProperties;
  revealInfo: boolean;
  belowInfo: boolean;
  revealWrapStyle: React.CSSProperties;
  revealDescStyle: React.CSSProperties;
};

// Translated directly from Galeria Efectos.dc.html cardFor() function
export function buildEffectStyles(
  eff: CardEffect,
  h: boolean,
  mx: number,
  my: number
): EffectStyles {
  let cardStyle: React.CSSProperties = {
    position: "relative",
    background: "rgba(255,255,255,0.045)",
    border: "0.5px solid rgba(255,255,255,0.09)",
    borderRadius: 16,
    overflow: "hidden",
    cursor: "pointer",
  };
  let photoWrapStyle: React.CSSProperties = {
    position: "relative",
    aspectRatio: "16 / 10",
    overflow: "hidden",
  };
  let imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transformOrigin: "center",
    transition: "transform .5s ease, filter .5s ease",
    zIndex: 1,
  };
  let overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 2,
    opacity: 0,
    transition: "opacity .35s ease",
  };
  let revealInfo = false;
  let belowInfo = true;
  let revealWrapStyle: React.CSSProperties = {};
  let revealDescStyle: React.CSSProperties = {};

  if (eff === "lift") {
    cardStyle = {
      ...cardStyle,
      transition: "transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s ease",
      transform: h ? "translateY(-10px)" : "none",
      boxShadow: h ? "0 22px 46px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.1)" : "scale(1)" };
  } else if (eff === "reveal") {
    belowInfo = false;
    revealInfo = true;
    photoWrapStyle = { ...photoWrapStyle, aspectRatio: "3 / 4" };
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease",
      boxShadow: h ? "0 22px 46px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.06)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(to top, rgba(8,13,30,0.96) 2%, rgba(8,13,30,0.45) 38%, rgba(8,13,30,0) 72%)",
      opacity: h ? 1 : 0.6,
    };
    revealWrapStyle = {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      zIndex: 3,
      color: "#F4F6FB",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      transform: h ? "translateY(0)" : "translateY(10px)",
      transition: "transform .35s ease",
    };
    revealDescStyle = {
      fontSize: 12.5,
      color: "rgba(244,246,251,0.8)",
      lineHeight: 1.4,
      overflow: "hidden",
      maxHeight: h ? 60 : 0,
      opacity: h ? 1 : 0,
      transition: "all .35s ease",
    };
  } else if (eff === "tilt") {
    cardStyle = {
      ...cardStyle,
      transition: h
        ? "transform .06s linear, box-shadow .3s ease"
        : "transform .45s ease, box-shadow .3s ease",
      transform: `perspective(720px) rotateX(${(-(my - 0.5) * 14).toFixed(2)}deg) rotateY(${((mx - 0.5) * 16).toFixed(2)}deg) scale(${h ? 1.03 : 1})`,
      transformStyle: "preserve-3d",
      boxShadow: h ? "0 24px 50px rgba(0,0,0,0.55)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.05)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: `radial-gradient(circle at ${(mx * 100).toFixed(1)}% ${(my * 100).toFixed(1)}%, rgba(255,255,255,0.30), rgba(255,255,255,0) 45%)`,
      opacity: h ? 1 : 0,
      transition: "opacity .2s ease",
    };
  } else if (eff === "spotlight") {
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease, border-color .3s ease",
      border: "0.5px solid " + (h ? "rgba(227,183,101,0.6)" : "rgba(255,255,255,0.09)"),
      boxShadow: h
        ? "0 0 0 1px rgba(227,183,101,0.4), 0 16px 44px rgba(227,183,101,0.18)"
        : "0 1px 3px rgba(0,0,0,0.25)",
    };
    overlayStyle = {
      ...overlayStyle,
      background: `radial-gradient(240px circle at ${(mx * 100).toFixed(1)}% ${(my * 100).toFixed(1)}%, rgba(227,183,101,0.34), rgba(227,183,101,0) 60%)`,
      opacity: h ? 1 : 0,
      transition: "opacity .2s ease",
    };
  } else if (eff === "duotone") {
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease",
      boxShadow: h ? "0 18px 42px rgba(0,0,0,0.45)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = {
      ...imgStyle,
      filter: h ? "none" : "grayscale(0.9) contrast(1.05) brightness(0.82)",
      transform: h ? "scale(1.06)" : "scale(1)",
    };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(135deg,#378ADD,#534AB7)",
      mixBlendMode: "color",
      opacity: h ? 0 : 0.55,
      transition: "opacity .5s ease",
    };
  } else if (eff === "glass") {
    belowInfo = false;
    revealInfo = true;
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease, transform .3s ease",
      transform: h ? "translateY(-6px)" : "none",
      boxShadow: h ? "0 22px 46px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.08)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(to top, rgba(8,13,30,0.5), rgba(8,13,30,0))",
      opacity: h ? 1 : 0.4,
    };
    revealWrapStyle = {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
      padding: "12px 14px",
      zIndex: 3,
      color: "#F4F6FB",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      borderRadius: 14,
      background: "rgba(16,26,58,0.55)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "0.5px solid rgba(255,255,255,0.18)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      transform: h ? "translateY(0)" : "translateY(8px)",
      transition: "transform .35s ease",
    };
    revealDescStyle = {
      fontSize: 12.5,
      color: "rgba(244,246,251,0.82)",
      lineHeight: 1.4,
      overflow: "hidden",
      maxHeight: h ? 60 : 0,
      opacity: h ? 1 : 0,
      transition: "all .35s ease",
    };
  } else if (eff === "shine") {
    cardStyle = {
      ...cardStyle,
      transition: "transform .3s ease, box-shadow .3s ease",
      transform: h ? "translateY(-6px)" : "none",
      boxShadow: h ? "0 20px 44px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.06)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(115deg, rgba(255,255,255,0) 35%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 65%)",
      backgroundSize: "250% 100%",
      backgroundRepeat: "no-repeat",
      backgroundPosition: h ? "-40% 0" : "160% 0",
      opacity: h ? 1 : 0,
      transition: h ? "background-position .8s ease, opacity .15s ease" : "opacity .3s ease",
    };
  } else if (eff === "focus") {
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease, transform .3s ease",
      transform: h ? "translateY(-6px)" : "none",
      boxShadow: h ? "0 20px 44px rgba(0,0,0,0.5)" : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = {
      ...imgStyle,
      filter: h ? "blur(0px) brightness(1)" : "blur(3px) brightness(0.72)",
      transform: h ? "scale(1.06)" : "scale(1.08)",
    };
  } else if (eff === "neon") {
    cardStyle = {
      ...cardStyle,
      transition: "box-shadow .3s ease, transform .3s ease, border-color .3s ease",
      transform: h ? "translateY(-6px)" : "none",
      border: "0.5px solid " + (h ? "rgba(83,74,183,0.9)" : "rgba(255,255,255,0.09)"),
      boxShadow: h
        ? "0 0 0 1.5px rgba(83,74,183,0.9), 0 0 22px rgba(55,138,221,0.55), 0 16px 40px rgba(0,0,0,0.45)"
        : "0 1px 3px rgba(0,0,0,0.25)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.05)" : "scale(1)" };
    overlayStyle = {
      ...overlayStyle,
      background: "linear-gradient(135deg, rgba(55,138,221,0.25), rgba(83,74,183,0.25))",
      opacity: h ? 1 : 0,
      transition: "opacity .3s ease",
    };
  } else {
    // polaroid
    cardStyle = {
      ...cardStyle,
      transition: "transform .35s cubic-bezier(.22,1,.36,1), box-shadow .3s ease",
      transform: h ? "rotate(0deg) translateY(-8px) scale(1.04)" : "rotate(-2deg)",
      boxShadow: h ? "0 26px 52px rgba(0,0,0,0.55)" : "0 6px 16px rgba(0,0,0,0.35)",
    };
    imgStyle = { ...imgStyle, transform: h ? "scale(1.04)" : "scale(1)" };
  }

  return {
    cardStyle,
    photoWrapStyle,
    imgStyle,
    overlayStyle,
    revealInfo,
    belowInfo,
    revealWrapStyle,
    revealDescStyle,
  };
}
