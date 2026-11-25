export const TELEMETRY_STYLES = `
html[data-theme="dark"] .rt2-root {
  background-image:
    linear-gradient(var(--rt-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--rt-grid-line) 1px, transparent 1px);
  background-size: 32px 32px;
}
.rt2-display {
  font-family: "Big Shoulders Display", "Bricolage Grotesque", sans-serif;
}
.rt2-chamfer {
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
}
/* True slanted-border chamfer frame (outer border layer + inset inner surface) */
.rt2-chamfer-frame {
  padding: 2px;
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
}
.rt2-chamfer-inner {
  clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
}
.rt2-btn-primary {
  background-color: var(--rt-accent);
  color: var(--rt-accent-fg);
  border: 2px solid var(--rt-border);
  cursor: pointer;
  transition: background-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}
.rt2-btn-primary:hover:not(:disabled) {
  background-color: var(--rt-accent-hover);
  transform: translateY(-1px);
  box-shadow: 2px 3px 0 var(--rt-accent-shadow);
}
.rt2-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rt2-btn-secondary {
  background-color: var(--rt-surface-alt);
  color: var(--rt-ink);
  border: 2px solid var(--rt-ui-border);
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
}
.rt2-btn-secondary:hover:not(:disabled) {
  border-color: var(--rt-ink);
  background-color: var(--rt-bg);
}
.rt2-btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rt2-btn-danger {
  background-color: var(--rt-surface-alt);
  color: var(--rt-accent-ink);
  border: 2px solid var(--rt-accent);
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, transform 120ms ease;
}
.rt2-btn-danger:hover:not(:disabled) {
  background-color: var(--rt-accent-soft);
}
.rt2-btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* Search input focus animation */
.rt2-search-box {
  transition:
    border-color 160ms ease,
    box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 160ms ease;
}
.rt2-search-box:focus-within {
  border-color: var(--rt-accent);
  box-shadow: 0 0 0 3px var(--rt-accent-soft), 0 4px 12px -4px rgba(18, 22, 27, 0.18);
  transform: translateY(-1px);
}
.rt2-search-box .rt2-search-icon {
  transition: color 160ms ease, transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}
.rt2-search-box:focus-within .rt2-search-icon {
  color: var(--rt-accent-ink);
  transform: scale(1.1);
}
/* Lively Squad Roster chip: 4px rounded when idle, morphs to true slanted-border chamfer on hover & selected */
.rt2-roster-chip {
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  clip-path: polygon(0 0, 100% 0, 100% 0, 100% 100%, 0 100%, 0 100%);
  transition:
    clip-path 200ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 200ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1.3),
    background-color 150ms ease,
    filter 160ms ease;
}
.rt2-roster-chip-inner {
  border-radius: 2px;
  clip-path: polygon(0 0, 100% 0, 100% 0, 100% 100%, 0 100%, 0 100%);
  transition:
    clip-path 200ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 200ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 150ms ease,
    color 150ms ease;
}
.rt2-roster-chip:hover,
.rt2-roster-chip[aria-pressed="true"] {
  border-radius: 0px;
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
}
.rt2-roster-chip:hover .rt2-roster-chip-inner,
.rt2-roster-chip[aria-pressed="true"] .rt2-roster-chip-inner {
  border-radius: 0px;
  clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
}
.rt2-roster-chip:hover {
  transform: translateY(-3px);
  background-color: var(--rt-accent);
  filter: drop-shadow(0 4px 0 var(--rt-accent-shadow));
}
.rt2-roster-chip:active {
  transform: translateY(0px) scale(0.98);
  filter: drop-shadow(0 1px 0 var(--rt-accent-shadow));
}
.rt2-row-hover {
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.rt2-row-hover:hover {
  background-color: var(--rt-accent-soft);
}
.rt2-row-hover:hover .rt2-row-title {
  text-decoration: underline;
}
.rt2-bill-header {
  cursor: pointer;
  transition: color 120ms ease;
}
.rt2-bill-header:hover .rt2-card-title {
  text-decoration: underline;
  color: var(--rt-accent-ink);
}
.rt2-bill-header:hover .rt2-card-chev {
  transform: translateX(3px);
}
.rt2-chunk-btn {
  cursor: pointer;
  transition: transform 120ms ease, filter 120ms ease, opacity 120ms ease, outline-color 120ms ease;
}
.rt2-chunk-btn:hover,
.rt2-chunk-btn:focus-visible {
  filter: brightness(1.12);
  outline: 2px solid var(--rt-ink);
  outline-offset: 1px;
  z-index: 20;
}
.rt2-pending-hatch {
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(0, 0, 0, 0.2) 0 5px,
    transparent 5px 10px
  );
}
.rt2-caution {
  background-image: repeating-linear-gradient(
    45deg,
    rgba(0, 0, 0, 0.22) 0 6px,
    transparent 6px 12px
  );
  background-size: 17px 17px;
  animation: rt2-caution 1.6s linear infinite;
}
.rt2-focus:focus-visible {
  outline: 2px solid var(--rt-accent);
  outline-offset: 2px;
}
/* Hidden scrollbars + soft edge gradient fades for scrollable containers */
.rt2-scroll-clean {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.rt2-scroll-clean::-webkit-scrollbar {
  display: none;
}
.rt2-scroll-fade-y {
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 16px,
    #000 calc(100% - 16px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 16px,
    #000 calc(100% - 16px),
    transparent 100%
  );
}
.rt2-scroll-fade-y::-webkit-scrollbar {
  display: none;
}
.rt2-scroll-fade-x {
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - 20px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - 20px),
    transparent 100%
  );
}
.rt2-scroll-fade-x::-webkit-scrollbar {
  display: none;
}
/* Animated Admin Collect-All Drawer (true right-edge swipe on open + close) */
.rt2-drawer-scrim {
  transition: opacity 240ms ease;
}
.rt2-drawer-panel {
  transition:
    translate 280ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
  will-change: translate, transform;
}
/* Smooth GPU-only directional enter transitions for Admin tabs & wizard steps */
@keyframes rt2-panel-in-right {
  from { transform: translate3d(10px, 0, 0); opacity: 0; }
  to { transform: translate3d(0, 0, 0); opacity: 1; }
}
@keyframes rt2-panel-in-left {
  from { transform: translate3d(-10px, 0, 0); opacity: 0; }
  to { transform: translate3d(0, 0, 0); opacity: 1; }
}
.rt2-panel-in-right {
  animation: rt2-panel-in-right 160ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.rt2-panel-in-left {
  animation: rt2-panel-in-left 160ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .rt2-panel-in-right,
  .rt2-panel-in-left {
    animation: none;
  }
}
/* Flutter-like Hero View Transitions for player avatar & name */
::view-transition-group(hero-player-avatar),
::view-transition-group(hero-player-name) {
  animation-duration: 280ms;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
}
::view-transition-old(hero-player-name),
::view-transition-new(hero-player-name) {
  height: 100%;
  object-fit: contain;
}
@keyframes rt2-caution {
  from { background-position: 0 0; }
  to { background-position: 17px 0; }
}
@keyframes rt2-flicker {
  0%, 100% { opacity: 1; }
  25% { opacity: 0.55; }
  50% { opacity: 1; }
  75% { opacity: 0.55; }
}
@keyframes rt2-reticle-in {
  from { transform: scale(1.3); opacity: 0.2; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes rt2-crack-draw {
  from { stroke-dashoffset: 60; }
  to { stroke-dashoffset: 0; }
}
@keyframes rt2-float {
  0% { transform: translate(-50%, 0); opacity: 0; }
  18% { transform: translate(-50%, -8px); opacity: 1; }
  100% { transform: translate(-50%, -28px); opacity: 0; }
}
@keyframes rt2-float-reduced {
  0% { opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes rt2-shard-1 {
  from { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  to { transform: translate(-12px, -14px) rotate(-14deg); opacity: 0; }
}
@keyframes rt2-shard-2 {
  from { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  to { transform: translate(14px, -10px) rotate(16deg); opacity: 0; }
}
@keyframes rt2-shard-3 {
  from { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  to { transform: translate(4px, 16px) rotate(-10deg); opacity: 0; }
}
@keyframes rt2-pop {
  0% { transform: scale(0.94); }
  55% { transform: scale(1.04); }
  100% { transform: scale(1); }
}
@keyframes rt2-rank-jump {
  0% { transform: translateY(5px); opacity: 0.4; }
  60% { transform: translateY(-2px); opacity: 1; }
  100% { transform: translateY(0); opacity: 1; }
}
@keyframes rt2-tooltip-in {
  from { transform: translateY(4px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes rt2-page-enter {
  from { transform: translateY(6px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes rt2-toast-in {
  from { transform: translateY(14px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes rt2-copied-pop {
  0% { transform: translate(-50%, 4px) scale(0.85); opacity: 0; }
  25% { transform: translate(-50%, -6px) scale(1.05); opacity: 1; }
  80% { transform: translate(-50%, -10px) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -16px) scale(0.95); opacity: 0; }
}
.rt2-flicker-wrap { animation: rt2-flicker 900ms linear infinite; }
.rt2-reticle { animation: rt2-reticle-in 140ms steps(3, end) forwards; }
.rt2-crack-path { stroke-dasharray: 60; animation: rt2-crack-draw 360ms ease-out forwards; }
.rt2-floater { animation: rt2-float 900ms ease-out forwards; }
.rt2-shard-1 { clip-path: polygon(0 0, 60% 0, 30% 100%, 0 100%); animation: rt2-shard-1 480ms ease-out forwards; }
.rt2-shard-2 { clip-path: polygon(60% 0, 100% 0, 100% 65%, 45% 55%); animation: rt2-shard-2 480ms ease-out forwards; }
.rt2-shard-3 { clip-path: polygon(30% 100%, 45% 55%, 100% 65%, 100% 100%); animation: rt2-shard-3 480ms ease-out forwards; }
.rt2-pop { animation: rt2-pop 200ms cubic-bezier(0.2, 0.9, 0.3, 1.3); }
.rt2-rank-jump { animation: rt2-rank-jump 240ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.rt2-tooltip-in { animation: rt2-tooltip-in 120ms ease-out forwards; }
.rt2-page-enter { animation: rt2-page-enter 160ms ease-out; }
.rt2-toast-in { animation: rt2-toast-in 180ms ease-out; }
.rt2-copied-pop { animation: rt2-copied-pop 1200ms ease-out forwards; }
.rt2-btn-primary:active:not(:disabled),
.rt2-btn-secondary:active:not(:disabled),
.rt2-btn-danger:active:not(:disabled) {
  transform: translateY(1px) scale(0.985);
}
/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .rt2-caution, .rt2-flicker-wrap, .rt2-reticle, .rt2-crack-path, .rt2-shard-1, .rt2-shard-2, .rt2-shard-3,
  .rt2-pop, .rt2-rank-jump, .rt2-tooltip-in, .rt2-page-enter, .rt2-toast-in, .rt2-copied-pop {
    animation: none !important;
  }
  ::view-transition-old(*), ::view-transition-new(*) {
    animation: none !important;
  }
  .rt2-floater { animation: rt2-float-reduced 1200ms linear forwards !important; }
  * { transition-duration: 0.01ms !important; }
}
`
