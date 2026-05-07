import { useState } from "react";
import type { MetalFxPreset, MetalFxTheme, MetalFxVariant } from "../src";
import { GsapVariant } from "./variants/GsapVariant";
import { GsapReflection } from "./variants/GsapReflection";

const PRESETS: MetalFxPreset[] = ["chromatic", "silver", "gold"];
const VARIANTS: MetalFxVariant[] = ["button", "circle"];

const ArrowUpIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 12V4M4 7l4-4 4 4" />
  </svg>
);

const ChevronIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 4l4 4-4 4" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);

interface GsapPlaygroundProps {
  theme: MetalFxTheme;
}

export function GsapPlayground({ theme }: GsapPlaygroundProps) {
  const [variant, setVariant] = useState<MetalFxVariant>("button");
  const [preset, setPreset] = useState<MetalFxPreset>("chromatic");
  const [strength, setStrength] = useState(1);
  const [disableGlow, setDisableGlow] = useState(false);
  const [disableReflections, setDisableReflections] = useState(false);

  const resolvedTheme = theme === "auto" ? "dark" : theme;

  return (
    <>
      <div className="pg-toolbar">
        <div className="pg-control-group">
          <span className="pg-control-group-label">Type</span>
          <div className="pg-toggle-row" role="radiogroup" aria-label="Variant type">
            {VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                className={`tab-btn${variant === v ? " active" : ""}`}
                onClick={() => setVariant(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="pg-control-group">
          <span className="pg-control-group-label">Color</span>
          <div className="pg-toggle-row" role="radiogroup" aria-label="Color preset">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`tab-btn${preset === p ? " active" : ""}`}
                onClick={() => setPreset(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="pg-control-group">
          <label className="pg-control-group-label" htmlFor="gsap-strength">
            Strength {Math.round(strength * 100)}%
          </label>
          <input
            id="gsap-strength"
            type="range"
            min={0}
            max={100}
            value={Math.round(strength * 100)}
            onChange={(e) => setStrength(Number(e.target.value) / 100)}
            style={{ width: 120 }}
          />
        </div>

        <div className="pg-control-group" style={{ justifyContent: "flex-end" }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer"
            }}
          >
            <input type="checkbox" checked={disableGlow} onChange={(e) => setDisableGlow(e.target.checked)} />
            No glow
          </label>
        </div>

        <div className="pg-control-group" style={{ justifyContent: "flex-end" }}>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer"
            }}
          >
            <input
              type="checkbox"
              checked={disableReflections}
              onChange={(e) => setDisableReflections(e.target.checked)}
            />
            No reflections
          </label>
        </div>
      </div>

      <div className="pg-preview">
        <GsapVariant
          preset={preset}
          theme={resolvedTheme}
          variant={variant}
          strength={strength}
          disableGlow={disableGlow}
          disableReflections={disableReflections}
        >
          {variant === "circle" ? (
            <button type="button" className="demo-circle">
              <ArrowUpIcon />
            </button>
          ) : (
            <button type="button" className="demo-pill">
              Upgrade to Pro
            </button>
          )}
        </GsapVariant>
      </div>

      <hr className="pg-divider" />
      <h2 className="section-title" style={{ marginBottom: 16 }}>
        Examples
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="example-card">
          <div className="mock-chat">
            <input className="mock-chat-input" placeholder="Build anything..." readOnly />
            <div className="mock-chat-row">
              <div className="mock-plus-btn">+</div>
              <div style={{ flex: 1 }} />
              <div className="mock-chip">
                Agent <ChevronIcon />
              </div>
              <div className="mock-chip">
                Auto <ChevronIcon />
              </div>
              <GsapVariant preset="gold" theme={resolvedTheme} variant="circle" disableGlow={disableGlow}>
                <button type="button" className="demo-circle" style={{ width: 36, height: 36, borderRadius: 18 }}>
                  <ArrowUpIcon />
                </button>
              </GsapVariant>
            </div>
          </div>
        </div>

        <div className="example-card">
          <div className="ui-row">
            <GsapReflection preset={preset} theme={resolvedTheme} side="right">
              <div className="mock-search">
                <SearchIcon />
                <span>Search</span>
              </div>
            </GsapReflection>
            <GsapVariant
              preset="chromatic"
              theme={resolvedTheme}
              disableGlow={disableGlow}
              disableReflections={disableReflections}
            >
              <button type="button" className="demo-pill">
                Upgrade to Pro
              </button>
            </GsapVariant>
            <GsapReflection preset={preset} theme={resolvedTheme} side="left">
              <button type="button" className="mock-dots">
                ···
              </button>
            </GsapReflection>
          </div>
        </div>
      </div>
    </>
  );
}
