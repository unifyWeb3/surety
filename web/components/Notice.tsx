import type { ReactNode } from "react";

export function Notice({
	kind = "quiet",
	kicker,
	title,
	children,
}: {
	kind?: "quiet" | "alert" | "config";
	kicker?: string;
	title: string;
	children?: ReactNode;
}) {
	return (
		<div className={`notice notice-${kind}`}>
			{kicker ? <p className="kicker">{kicker}</p> : null}
			<h2>{title}</h2>
			{children}
		</div>
	);
}

/** The one chain-configuration failure state. Same text wherever a read was requested. */
export function ChainNotice({ problem }: { problem: string }) {
	return (
		<Notice kind="config" kicker="chain configuration" title="No chain to read, so nothing is shown">
			<p>{problem}</p>
			<p className="mono small">
				Set NEXT_PUBLIC_GENLAYER_RPC_URL and NEXT_PUBLIC_SURETY_CONTRACT, then reload. Both are
				public values; this app has no key of any kind.
			</p>
		</Notice>
	);
}

export function ReadFailure({ title, error }: { title: string; error: string }) {
	return (
		<Notice kind="alert" kicker="chain read failed" title={title}>
			<p className="break">{error}</p>
			<p className="dim small">
				Nothing on this page was substituted for the missing answer. A register that fails is
				shown as failed.
			</p>
		</Notice>
	);
}

export function EmptyLedger({ note }: { note: ReactNode }) {
	return (
		<Notice kind="quiet" kicker="empty register" title="No covenant has been registered yet">
			{note}
		</Notice>
	);
}
