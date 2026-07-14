import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function App() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">M1 Docker smoke test</p>
        <h1>OAuth OIDC Demo</h1>
        <p>
          The frontend container is running. Authentication screens arrive in the frontend
          milestone.
        </p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
