import React from 'react';
import { CopyButton } from './components/CopyButton';
import { Examples } from './components/Examples';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Playground } from './components/Playground';
import { useTheme } from './hooks/useTheme';

export function App() {
  const [theme, toggleTheme] = useTheme();

  return (
    <main className="app">
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <Examples theme={theme} />

      <section className="section" aria-label="Installation">
        <h2 className="section-title">Installation</h2>
        <div className="code-block">
          <code>npm install metal-fx</code>
          <CopyButton getText={() => 'npm install metal-fx'} />
        </div>
      </section>

      <section className="section" aria-label="Usage">
        <h2 className="section-title section-title--muted">Usage</h2>
        <div className="code-block code-block--multi">
          <code>{`import { MetalFx } from 'metal-fx';\n\n<MetalFx preset="chromatic" strength={1}>\n  <button>Upgrade to Pro</button>\n</MetalFx>`}</code>
          <CopyButton getText={() => `import { MetalFx } from 'metal-fx';\n\n<MetalFx preset="chromatic" strength={1}>\n  <button>Upgrade to Pro</button>\n</MetalFx>`} />
        </div>
      </section>

      <Playground theme={theme} />

      <Footer />
    </main>
  );
}
