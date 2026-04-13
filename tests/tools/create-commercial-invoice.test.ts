import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, type ToolHandler } from "../helpers/mock-server.js";
import {
  MOCK_CONFIG,
  MOCK_INVOICE_RESPONSE,
  VALID_ORIGIN_ARGS,
  VALID_DESTINATION_ARGS,
} from "../helpers/fixtures.js";
import { EnviaApiClient } from "../../src/utils/api-client.js";
import { registerCreateCommercialInvoice } from "../../src/tools/create-commercial-invoice.js";

const BASE_ARGS = {
  ...VALID_ORIGIN_ARGS,
  ...VALID_DESTINATION_ARGS,
  carrier: "dhl",
  item_description: "Cotton T-shirts",
  item_hs_code: "6109.10",
  item_quantity: 10,
  item_unit_price: 15.0,
  item_country_of_manufacture: "MX",
  export_reason: "sale",
  duties_payment: "sender",
};

describe("envia_create_commercial_invoice", () => {
  let handler: ToolHandler;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_INVOICE_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { server, handlers } = createMockServer();
    const client = new EnviaApiClient(MOCK_CONFIG);
    registerCreateCommercialInvoice(server, client, MOCK_CONFIG);
    handler = handlers.get("envia_create_commercial_invoice")!;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. calls POST /ship/commercial-invoice with correct body
  // -------------------------------------------------------------------------
  it("calls POST /ship/commercial-invoice with correct body", async () => {
    await handler(BASE_ARGS);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe(`${MOCK_CONFIG.shippingBase}/ship/commercial-invoice`);
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty("origin");
    expect(body).toHaveProperty("destination");
    expect(body).toHaveProperty("shipment");
    expect(body).toHaveProperty("packages");
    expect(body).toHaveProperty("customsSettings");
  });

  // -------------------------------------------------------------------------
  // 2. builds origin and destination addresses correctly
  // -------------------------------------------------------------------------
  it("builds origin and destination addresses correctly", async () => {
    await handler(BASE_ARGS);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(body.origin).toEqual({
      name: VALID_ORIGIN_ARGS.origin_name,
      phone: VALID_ORIGIN_ARGS.origin_phone,
      street: VALID_ORIGIN_ARGS.origin_street,
      number: '',
      city: VALID_ORIGIN_ARGS.origin_city,
      state: VALID_ORIGIN_ARGS.origin_state,
      country: VALID_ORIGIN_ARGS.origin_country.toUpperCase(),
      postalCode: VALID_ORIGIN_ARGS.origin_postal_code,
    });

    expect(body.destination).toEqual({
      name: VALID_DESTINATION_ARGS.destination_name,
      phone: VALID_DESTINATION_ARGS.destination_phone,
      street: VALID_DESTINATION_ARGS.destination_street,
      number: '',
      city: VALID_DESTINATION_ARGS.destination_city,
      state: VALID_DESTINATION_ARGS.destination_state,
      country: VALID_DESTINATION_ARGS.destination_country.toUpperCase(),
      postalCode: VALID_DESTINATION_ARGS.destination_postal_code,
    });
  });

  // -------------------------------------------------------------------------
  // 3. lowercases and trims carrier slug
  // -------------------------------------------------------------------------
  it("lowercases and trims carrier slug", async () => {
    await handler({ ...BASE_ARGS, carrier: "  DHL  " });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shipment.carrier).toBe("dhl");
  });

  // -------------------------------------------------------------------------
  // 4. uppercases item_country_of_manufacture
  // -------------------------------------------------------------------------
  it("uppercases item_country_of_manufacture", async () => {
    await handler({ ...BASE_ARGS, item_country_of_manufacture: " mx " });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const item = body.packages[0].items[0];
    expect(item.countryOfManufacture).toBe("MX");
  });

  // -------------------------------------------------------------------------
  // 5. structures items array correctly
  // -------------------------------------------------------------------------
  it("structures items array correctly", async () => {
    await handler(BASE_ARGS);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const items = body.packages[0].items;

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      description: "Cotton T-shirts",
      hsCode: "6109.10",
      quantity: 10,
      price: 15.0,
      countryOfManufacture: "MX",
    });
  });

  // -------------------------------------------------------------------------
  // 6. includes customsSettings with dutiesPaymentEntity and exportReason
  // -------------------------------------------------------------------------
  it("includes customsSettings with dutiesPaymentEntity and exportReason", async () => {
    await handler(BASE_ARGS);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.customsSettings).toEqual({
      dutiesPaymentEntity: "sender",
      exportReason: "sale",
    });
  });

  // -------------------------------------------------------------------------
  // 7. returns success with invoice number, URL, and ID
  // -------------------------------------------------------------------------
  it("returns success with invoice number, URL, and ID", async () => {
    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    expect(text).toContain("Commercial invoice created successfully!");
    expect(text).toContain("Invoice #:    CI-12345");
    expect(text).toContain(
      "Invoice PDF:  https://api.envia.com/invoices/INV-2026-001.pdf",
    );
    expect(text).toContain("Invoice ID:   INV-2026-001");
  });

  // -------------------------------------------------------------------------
  // 8. returns error message when API fails
  // -------------------------------------------------------------------------
  it("returns error message when API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ message: "Invalid HS code" }),
    });

    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    expect(text).toContain("Commercial invoice creation failed:");
  });

  // -------------------------------------------------------------------------
  // 9. mentions classify_hscode in error tip
  // -------------------------------------------------------------------------
  it("mentions classify_hscode in error tip", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({ message: "Validation error" }),
    });

    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    expect(text).toContain("classify_hscode");
  });

  // -------------------------------------------------------------------------
  // 10. uses default values for export_reason and duties_payment
  // -------------------------------------------------------------------------
  it("uses default values for export_reason and duties_payment", async () => {
    // Pass args without export_reason and duties_payment to use defaults
    const argsWithDefaults = { ...BASE_ARGS };
    // Defaults are "sale" and "sender" as defined in the schema
    await handler(argsWithDefaults);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.customsSettings.exportReason).toBe("sale");
    expect(body.customsSettings.dutiesPaymentEntity).toBe("sender");
  });

  // -------------------------------------------------------------------------
  // 11. includes 'Next steps' guidance in success output
  // -------------------------------------------------------------------------
  it("includes 'Next steps' guidance in success output", async () => {
    const result = await handler(BASE_ARGS);
    const text = result.content[0].text;

    expect(text).toContain("Next steps:");
    expect(text).toContain("create_shipment");
  });
});
