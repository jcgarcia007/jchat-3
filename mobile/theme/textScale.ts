/**
 * Font-scale caps (Dynamic Type / Android fontScale), DT-1.
 * Content text (messages, descriptions, menus) must GROW with the system setting, up to CONTENT_TEXT_CAP;
 * short labels inside fixed-shape containers (header, tabs, chips, dock) stop growing at LABEL_TEXT_CAP.
 * Never turn allowFontScaling off on content: the cap is the only limit.
 */
export const CONTENT_TEXT_CAP = 1.6;
export const LABEL_TEXT_CAP = 1.3;
