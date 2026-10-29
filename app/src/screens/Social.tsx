import { useState } from "react";
import { ExternalLink } from "../components/ExternalLink";
import { CreateGym } from "../components/CreateGym";
import { Sheet } from "../components/Sheet";
import { directionsUrl, gymLine } from "../lib/gyms";
import { useGymSearch } from "../lib/useGymSearch";

export function Social() {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const { found, loading, reload } = useGymSearch(q);

  return (
    <main className="screen">
      <header className="stack-sm">
        <h1>Social</h1>
      </header>

      <section className="stack" aria-labelledby="gyms-h">
        <div className="bw-head">
          <h2 id="gyms-h">Gyms</h2>
          <button className="btn" onClick={() => setAdding(true)}>Add gym</button>
        </div>
        <label className="field">
          <span className="sr-only">Search gyms</span>
          <input type="search" placeholder="Search by name, area or city" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>

        {found.length > 0 && (
          <ul className="rows card" aria-busy={loading} aria-label="Gyms">
            {found.map((g) => (
              <li key={g.id} className="gym-row">
                <span className="gym-main">
                  <span className="card-title">{g.name}</span>
                  <span className="dim small">{gymLine(g) || "—"}</span>
                </span>
                <ExternalLink className="btn small-btn" href={directionsUrl(g)} aria-label={`Directions to ${g.name}`}>
                  Directions
                </ExternalLink>
              </li>
            ))}
          </ul>
        )}
        {!loading && found.length === 0 && <p className="dim empty">{q.trim() ? "No gyms match." : "No gyms yet."}</p>}
      </section>

      <Sheet open={adding} onOpenChange={setAdding} title="New gym">
        {adding && (
          <CreateGym
            initialName={q.trim()}
            onCreated={() => {
              setAdding(false);
              reload();
            }}
          />
        )}
      </Sheet>
    </main>
  );
}
