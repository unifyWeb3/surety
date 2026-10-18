# web/ — the Surety reader

A read-only Next.js app: it reads the deployed surety contract over a public JSON-RPC endpoint and
renders what the contract actually returns. It composes transactions and prints the exact command to
send them; it never signs and holds no key.

## Configure

Two public variables, no secrets:

```bash
cp .env.example .env.local
```

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | The JSON-RPC endpoint to read. Studionet: `https://studio.genlayer.com/api` |
| `NEXT_PUBLIC_SURETY_CONTRACT` | The deployed contract address, `0x` + 40 hex |

**Missing configuration is a rendered error, not a fallback.** There is no default RPC and no
default address anywhere in this app, because a page that cannot read the chain must never be able
to show something that looks like an empty register, or like a verdict.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

## Routes

| Route | What it is |
|---|---|
| `/` | What Surety decides, what it deliberately is not, and the live counters plus the newest covenants |
| `/ledger` | Every covenant, newest first, with an owner filter that the contract itself validates |
| `/covenant/[id]` | One instrument: the promise, the rule, the citation and its digest, the last check, the bond stated plainly, and the raw record |
| `/new` | Composer. Validates locally against a mirror of the contract's rules, asks the contract to read the rule back, and emits the exact create command |
| `/api/rule` | `POST {"rule": "…"}` → the contract's own `rule_shape` answer for that rule |

Every page that reads the chain is `force-dynamic`: a cached verdict is the one mistake this product
cannot afford.

## Trust notes

- Values are shown as the contract returns them. Empty means the contract says empty, not zero.
- `beneficiary` is labelled as the owner's declaration, because that is all it is.
- The bond is labelled as recorded, never held. There is no payout path in the contract.
- A failed read is shown as a failed read, with the RPC's own words.
