import qrcode from "qrcode-generator";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { Ruolo, Transport } from "@/transport/types.ts";
import type { SessioneClient, SessioneHost } from "@/transport/webrtc.ts";
import { creaSessioneClient, creaSessioneHost } from "@/transport/webrtc.ts";

/**
 * Lobby P2P 1v1: signaling manuale via QR o testo copiabile (implements.md §8.1).
 *
 * Nessun server: host e ospite si scambiano due blob (offerta, poi risposta) a
 * mano — mostrando un QR sullo schermo di chi ha il codice, o incollando una
 * stringa. Il QR è **solo** offerta/risposta SDP compressa (AGENTS.md §4): nessun
 * nome, nessun dato personale, nessun URL.
 *
 * Scansione da camera: **deliberatamente fuori da questa fase** — instabile da
 * verificare in modo affidabile su tutti i browser (`BarcodeDetector` manca su
 * Safari). Il flusso QR-mostrato + testo-incollato è già completo da solo:
 * chi riceve il codice lo legge con la fotocamera di un'altra app o con
 * l'occhio+tastiera, non serve altro per giocare. Vedi implements.md §8 e
 * CHANGELOG per la decisione.
 */

export interface ConnessioneOnline {
  readonly transport: Transport;
  readonly ruolo: Ruolo;
  /** Usato solo se `ruolo === "host"`: il seme di semina della partita. */
  readonly seed: number;
}

interface Props {
  readonly onConnesso: (connessione: ConnessioneOnline) => void;
  readonly onIndietro: () => void;
}

type Fase =
  | { readonly tipo: "scelta" }
  | { readonly tipo: "host-preparazione" }
  | {
      readonly tipo: "host-attesa-risposta";
      readonly offerta: string;
      readonly errore: string | null;
    }
  | { readonly tipo: "host-connettendo" }
  | { readonly tipo: "client-incolla"; readonly errore: string | null }
  | { readonly tipo: "client-preparazione" }
  | { readonly tipo: "client-attesa-connessione"; readonly risposta: string }
  | { readonly tipo: "errore"; readonly messaggio: string };

export function OnlineLobby({ onConnesso, onIndietro }: Props) {
  const [fase, setFase] = useState<Fase>({ tipo: "scelta" });
  const sessioneRef = useRef<SessioneHost | SessioneClient | null>(null);
  const ruoloRef = useRef<Ruolo>("host");
  const seedRef = useRef(0);
  const vivoRef = useRef(true);
  /**
   * 🔴 Vero da quando `onConnesso` è stato chiamato: da quel momento il
   * `Transport` non è più "nostro", è del chiamante (che lo passa a
   * `useHostOnline`/`useClientOnline`). Senza questa guardia, lo smontaggio
   * di `OnlineLobby` che segue subito la consegna (il genitore sostituisce
   * questo componente col tavolo) fa scattare comunque la cleanup qui sotto,
   * che chiamava `sessioneRef.current?.annulla()` — chiudendo la connessione
   * **appena stabilita**, prima ancora che il tavolo riuscisse a usarla.
   * Bug vero, non un'ipotesi: si vedeva in browser come una disconnessione
   * immediata subito dopo "connesso" — trovato verificando il flusso reale a
   * due schede (i test non montano componenti React, non l'avrebbero mai
   * beccato). Vedi CHANGELOG.
   */
  const consegnatoRef = useRef(false);

  /**
   * 🔴 Il valore iniziale di `useRef(true)` da solo NON basta: in
   * `StrictMode` (sviluppo) React monta, smonta e rimonta ogni effetto una
   * volta per stanare effetti collaterali impuri. La cleanup gira comunque,
   * mettendo `vivoRef.current` a `false` — e senza rimetterlo a `true` nel
   * corpo dell'effetto (non solo nella cleanup), resterebbe `false` per
   * sempre: ogni `await` nella lobby (`iniziaHost`, `accettaOfferta`...) si
   * fermerebbe silenziosamente al primo controllo `if (!vivoRef.current) return`,
   * e "Preparazione del codice…" resterebbe a schermo in eterno. Bug vero,
   * trovato verificando il flusso in un browser reale con due schede (non
   * dai test, che non montano componenti React) — vedi CHANGELOG.
   */
  useEffect(() => {
    vivoRef.current = true;
    return () => {
      vivoRef.current = false;
      if (!consegnatoRef.current) sessioneRef.current?.annulla();
    };
  }, []);

  const resetta = useCallback(() => {
    sessioneRef.current?.annulla();
    sessioneRef.current = null;
    setFase({ tipo: "scelta" });
  }, []);

  const iniziaHost = useCallback(async () => {
    sessioneRef.current?.annulla();
    ruoloRef.current = "host";
    seedRef.current = Math.floor(Math.random() * 0xffffffff);
    setFase({ tipo: "host-preparazione" });
    const sessione = creaSessioneHost();
    sessioneRef.current = sessione;
    try {
      const offerta = await sessione.offerta;
      if (!vivoRef.current || sessioneRef.current !== sessione) return;
      setFase({ tipo: "host-attesa-risposta", offerta, errore: null });
    } catch {
      if (!vivoRef.current) return;
      setFase({ tipo: "errore", messaggio: "Non è stato possibile preparare il codice. Riprova." });
    }
  }, []);

  const iniziaClient = useCallback(() => {
    sessioneRef.current?.annulla();
    sessioneRef.current = null;
    ruoloRef.current = "client";
    setFase({ tipo: "client-incolla", errore: null });
  }, []);

  const connettiComeHost = useCallback(async (blobRisposta: string) => {
    const sessione = sessioneRef.current;
    if (!sessione || !("accettaRisposta" in sessione)) return;
    const testo = blobRisposta.trim();
    if (!testo) return;
    const ok = await sessione.accettaRisposta(testo);
    if (!vivoRef.current || sessioneRef.current !== sessione) return;
    if (!ok) {
      setFase((f) =>
        f.tipo === "host-attesa-risposta"
          ? { ...f, errore: "Codice non valido: controlla di averlo copiato per intero." }
          : f,
      );
      return;
    }
    setFase({ tipo: "host-connettendo" });
  }, []);

  const accettaOfferta = useCallback(async (blobOfferta: string) => {
    const testo = blobOfferta.trim();
    if (!testo) return;
    setFase({ tipo: "client-preparazione" });
    const sessione = creaSessioneClient();
    sessioneRef.current = sessione;
    const risposta = await sessione.accettaOfferta(testo);
    if (!vivoRef.current || sessioneRef.current !== sessione) return;
    if (!risposta) {
      sessione.annulla();
      sessioneRef.current = null;
      setFase({
        tipo: "client-incolla",
        errore: "Codice non valido: controlla di averlo copiato per intero.",
      });
      return;
    }
    setFase({ tipo: "client-attesa-connessione", risposta });
  }, []);

  // Mentre si aspetta che il canale dati si apra davvero: si iscrive allo stato
  // del trasporto e passa la mano al chiamante appena è "connesso". Se invece
  // cade prima di arrivarci (ICE fallito, rete diversa, niente STUN raggiungibile
  // in una LAN chiusa), si mostra un errore con la possibilità di riprovare da capo.
  useEffect(() => {
    if (fase.tipo !== "host-connettendo" && fase.tipo !== "client-attesa-connessione") return;
    const sessione = sessioneRef.current;
    if (!sessione) return;
    const { transport } = sessione;

    function connesso() {
      consegnatoRef.current = true;
      onConnesso({ transport, ruolo: ruoloRef.current, seed: seedRef.current });
    }
    if (transport.stato === "connesso") {
      connesso();
      return;
    }
    const cancella = transport.onStato((s) => {
      if (s === "connesso") {
        connesso();
      } else if ((s === "disconnesso" || s === "chiuso") && vivoRef.current) {
        setFase({
          tipo: "errore",
          messaggio:
            "La connessione non si è stabilita. Controllate di essere sulla stessa rete (o con internet attivo su entrambi) e riprovate.",
        });
      }
    });
    return cancella;
    // eslint: `onConnesso` è stabile lato chiamante (useCallback in Gioca.tsx);
    // includerlo comunque per correttezza non cambia il comportamento.
  }, [fase.tipo, onConnesso]);

  return (
    <main className="table-felt flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={() => {
            if (fase.tipo === "scelta") onIndietro();
            else resetta();
          }}
          className="text-on-felt-muted text-sm hover:text-on-felt"
        >
          ← {fase.tipo === "scelta" ? "Menu" : "Ricomincia"}
        </button>

        <h1 className="mt-3 font-semibold text-3xl text-on-felt tracking-tight">Gioca online</h1>
        <p className="mt-1 text-on-felt-muted text-sm">
          1 contro 1, senza server: un codice fa da tramite fra i due telefoni.
        </p>

        <div className="mt-7">
          {fase.tipo === "scelta" && (
            <FaseScelta onHost={() => void iniziaHost()} onClient={iniziaClient} />
          )}
          {fase.tipo === "host-preparazione" && <Attesa messaggio="Preparazione del codice…" />}
          {fase.tipo === "host-attesa-risposta" && (
            <FaseHostAttesaRisposta
              offerta={fase.offerta}
              errore={fase.errore}
              onRisposta={(blob) => void connettiComeHost(blob)}
            />
          )}
          {fase.tipo === "host-connettendo" && <Attesa messaggio="Connessione in corso…" lunga />}
          {fase.tipo === "client-incolla" && (
            <FaseClientIncolla
              errore={fase.errore}
              onOfferta={(blob) => void accettaOfferta(blob)}
            />
          )}
          {fase.tipo === "client-preparazione" && (
            <Attesa messaggio="Preparazione della risposta…" />
          )}
          {fase.tipo === "client-attesa-connessione" && (
            <FaseClientAttesaConnessione risposta={fase.risposta} />
          )}
          {fase.tipo === "errore" && <FaseErrore messaggio={fase.messaggio} onRiprova={resetta} />}
        </div>
      </div>
    </main>
  );
}

function FaseScelta({
  onHost,
  onClient,
}: {
  readonly onHost: () => void;
  readonly onClient: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ScegliRiga
        titolo="Crea partita"
        nota="Sei l'host: mostri un codice, il tuo amico lo legge."
        onClick={onHost}
      />
      <ScegliRiga
        titolo="Unisciti a una partita"
        nota="Hai ricevuto un codice: lo incolli qui."
        onClick={onClient}
      />
      <p className="mt-2 text-on-felt-muted/70 text-xs">
        Funziona meglio sulla stessa rete (Wi-Fi o hotspot). Nessun dato lascia i vostri due
        telefoni: non c'è un server in mezzo.
      </p>
    </div>
  );
}

function ScegliRiga({
  titolo,
  nota,
  onClick,
}: {
  readonly titolo: string;
  readonly nota: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-white/12 px-4 py-3 text-left transition-colors hover:border-brass/35 hover:bg-felt-deep/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass"
    >
      <span className="block font-medium text-on-felt text-sm">{titolo}</span>
      <span className="block text-on-felt-muted text-xs">{nota}</span>
    </button>
  );
}

function Attesa({
  messaggio,
  lunga = false,
}: {
  readonly messaggio: string;
  readonly lunga?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-brass/30 border-t-brass"
      />
      <p className="text-on-felt text-sm">{messaggio}</p>
      {lunga && (
        <p className="text-on-felt-muted/70 text-xs">
          Può richiedere fino a mezzo minuto sulla prima connessione.
        </p>
      )}
    </div>
  );
}

function FaseErrore({
  messaggio,
  onRiprova,
}: {
  readonly messaggio: string;
  readonly onRiprova: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <p className="text-on-felt text-sm">{messaggio}</p>
      <Button onClick={onRiprova}>Riprova</Button>
    </div>
  );
}

/** Il blob di signaling, come QR e come testo selezionabile — sempre entrambi, il testo è il paracadute che funziona ovunque. */
function BlobCondivisibile({
  etichetta,
  valore,
}: {
  readonly etichetta: string;
  readonly valore: string;
}) {
  const [copiato, setCopiato] = useState(false);

  const copia = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(valore);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      // Clipboard API assente o negata (es. contesto non sicuro): il testo
      // resta comunque selezionabile qui sotto, copia manuale sempre possibile.
    }
  }, [valore]);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-center text-on-felt-muted text-xs">{etichetta}</p>
      <CodiceQR valore={valore} />
      <Button variant="outline" size="sm" onClick={() => void copia()} className="w-full">
        {copiato ? "Copiato ✓" : "Copia il codice"}
      </Button>
      <textarea
        readOnly
        name="codice-signaling"
        value={valore}
        onFocus={(e) => e.currentTarget.select()}
        rows={3}
        className="w-full rounded-lg border border-white/12 bg-felt-deep/60 p-2 text-[10px] text-on-felt-muted/80 leading-tight"
        aria-label={`${etichetta} — testo del codice, selezionabile`}
      />
    </div>
  );
}

/** Genera un QR come immagine (`data:` URL) dal blob: mai `dangerouslySetInnerHTML`, mai dati oltre l'SDP compresso (AGENTS.md §4). */
function CodiceQR({ valore }: { readonly valore: string }) {
  const dataUrl = useMemo(() => {
    try {
      // Livello 'L' (minima correzione d'errore): massimizza la capacità utile,
      // il testo copiabile resta comunque sempre disponibile come paracadute.
      const qr = qrcode(0, "L");
      qr.addData(valore);
      qr.make();
      return qr.createDataURL(6, 8);
    } catch {
      return null;
    }
  }, [valore]);

  if (!dataUrl) {
    return (
      <p className="text-center text-on-felt-muted text-xs">
        Il codice è troppo lungo per un QR leggibile: usate il testo qui sotto.
      </p>
    );
  }
  return (
    <img
      src={dataUrl}
      alt="Codice QR di connessione: contiene solo dati tecnici della connessione, nessun dato personale"
      className="h-56 w-56 rounded-lg bg-white p-2"
    />
  );
}

function CampoIncolla({
  placeholder,
  errore,
  etichettaBottone,
  onConferma,
}: {
  readonly placeholder: string;
  readonly errore: string | null;
  readonly etichettaBottone: string;
  readonly onConferma: (testo: string) => void;
}) {
  const [testo, setTesto] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onConferma(testo);
      }}
    >
      <textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        placeholder={placeholder}
        name="codice-incollato"
        rows={4}
        className={cn(
          "w-full rounded-lg border bg-felt-deep/60 p-2 text-on-felt text-xs leading-tight placeholder:text-on-felt-muted/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass",
          errore ? "border-destructive/60" : "border-white/12",
        )}
        aria-label={placeholder}
        aria-invalid={errore !== null}
      />
      {errore && <p className="text-destructive text-xs">{errore}</p>}
      <Button type="submit" disabled={testo.trim().length === 0} className="w-full">
        {etichettaBottone}
      </Button>
    </form>
  );
}

function FaseHostAttesaRisposta({
  offerta,
  errore,
  onRisposta,
}: {
  readonly offerta: string;
  readonly errore: string | null;
  readonly onRisposta: (blob: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <BlobCondivisibile
        etichetta="1. Fate leggere questo codice al vostro amico"
        valore={offerta}
      />
      <div className="border-white/12 border-t pt-5">
        <p className="mb-2 text-center text-on-felt-muted text-xs">
          2. Incollate qui il codice di risposta che vi manda
        </p>
        <CampoIncolla
          placeholder="Incolla qui il codice di risposta…"
          errore={errore}
          etichettaBottone="Connetti"
          onConferma={onRisposta}
        />
      </div>
    </div>
  );
}

function FaseClientIncolla({
  errore,
  onOfferta,
}: {
  readonly errore: string | null;
  readonly onOfferta: (blob: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-center text-on-felt-muted text-xs">
        Incollate qui il codice che vi ha mandato chi ha creato la partita
      </p>
      <CampoIncolla
        placeholder="Incolla qui il codice…"
        errore={errore}
        etichettaBottone="Continua"
        onConferma={onOfferta}
      />
    </div>
  );
}

function FaseClientAttesaConnessione({ risposta }: { readonly risposta: string }) {
  return (
    <div className="flex flex-col gap-4">
      <BlobCondivisibile
        etichetta="Fate leggere questo codice di risposta a chi ha creato la partita"
        valore={risposta}
      />
      <p className="text-center text-on-felt-muted text-xs">
        Appena lo incolla dalla sua parte, la partita comincia da sola qui.
      </p>
    </div>
  );
}
