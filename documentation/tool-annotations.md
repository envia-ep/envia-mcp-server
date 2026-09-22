# Tool annotations

Every tool declares `readOnlyHint`, `openWorldHint`, and `destructiveHint`.
Incorrect or missing annotations are a documented cause of ChatGPT listing
rejection, and the submission portal asks for a justification per annotation —
this file is that justification.

## Criteria

**`readOnlyHint: true`** — the tool cannot change state anywhere. It fetches,
looks up, lists, previews, or computes. Any call that writes to Envia, to a
carrier, or to a ticket is `false`.

**`openWorldHint: true`** — the answer depends on a party outside Envia. Quoting,
creating, cancelling, tracking, manifests and customs documents reach a carrier;
pickups and non-delivery reports reach the carrier too, in both directions; order
and shop tools reach the ecommerce platform. Data that lives in the account —
catalogs, addresses, clients, packages, tickets, analytics, billing — is `false`.

**`destructiveHint: true`** — any one of:

1. it deletes or overwrites existing state (`delete_*`, `update_*`,
   `select_order_service`, `manage_order_tags`);
2. it creates a charge or a document filed with a carrier or tax authority
   (`create_shipment`, `schedule_pickup`, `cancel_shipment`,
   `generate_manifest`, `generate_complement`);
3. it sends something a person receives and cannot unsend (`create_ticket`,
   `add_ticket_comment`, `rate_ticket`, `submit_nd_report`);
4. it is irreversible by the tool's own contract (`fulfill_order` marks the
   order COMPLETED once every package is fulfilled).

`destructiveHint: false` stays for writes that create a private, editable record
and for documents generated for the user's own use: `create_address`,
`create_package`, `create_client`, `generate_packing_slip`,
`generate_picking_list`.

## Why `create_*` is not uniformly destructive

Creating an address book entry is undone by deleting it. Creating a shipment
charges the account and hands a label to a carrier. The annotation marks the
second kind so the client can ask the user first, which is what OpenAI asks for:
mark write actions clearly so clients can require confirmation.

Annotations do not replace authorization. The transport gate still refuses a
protected `tools/call` without a credential, and Envia enforces account
permissions on every request.
