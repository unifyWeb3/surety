import type { ReactNode } from "react";

/** Wide-row ledger of promises. A table, because the columns are the comparison. */
export function LedgerTable({ children }: { children: ReactNode }) {
	return (
		<div className="tablewrap">
			<table className="ledger">
				<caption>Newest first. Every column is read from the contract, not derived here.</caption>
				<thead>
					<tr>
						<th scope="col">Status</th>
						<th scope="col">Promise, as its owner wrote it</th>
						<th scope="col">Rule that counts as breaking it</th>
						<th scope="col">Subject</th>
						<th scope="col">Owner</th>
						<th scope="col">Last check</th>
					</tr>
				</thead>
				<tbody>{children}</tbody>
			</table>
		</div>
	);
}

export function LedgerRow({
	statusCell,
	href,
	label,
	promise,
	rule,
	subject,
	owner,
	lastCheck,
}: {
	statusCell: ReactNode;
	href: string;
	label: string;
	promise: string;
	rule: string;
	subject: string;
	owner: string;
	lastCheck: ReactNode;
}) {
	return (
		<tr>
			<td data-label="Status">
				{statusCell}
				<div className="mono faint small" style={{ marginTop: 6 }}>
					{label}
				</div>
			</td>
			<td data-label="Promise">
				<a href={href}>{promise}</a>
			</td>
			<td data-label="Rule" className="rule">
				{rule}
			</td>
			<td className="subject" data-label="Subject">
				{subject}
			</td>
			<td className="machine" data-label="Owner">
				{owner}
			</td>
			<td className="machine" data-label="Last check">
				{lastCheck}
			</td>
		</tr>
	);
}
