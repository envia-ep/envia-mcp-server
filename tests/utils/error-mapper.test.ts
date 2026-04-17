import { describe, it, expect } from 'vitest';
import { mapCarrierError } from '../../src/utils/error-mapper.js';

describe('mapCarrierError', () => {
    // -----------------------------------------------------------------
    // Known error codes
    // -----------------------------------------------------------------

    it('should map code 1101 to resource not found', () => {
        const result = mapCarrierError(1101, 'some backend message');

        expect(result.userMessage).toBe('Resource not found or shipment too old (>60 days)');
        expect(result.suggestion).toContain('tracking number');
        expect(result.retryable).toBe(false);
    });

    it('should map code 1105 to weight/dimensions exceeded', () => {
        const result = mapCarrierError(1105, 'some backend message');

        expect(result.userMessage).toBe('Package weight or dimensions exceed carrier limits');
        expect(result.suggestion).toContain('Reduce package weight');
        expect(result.retryable).toBe(false);
    });

    it('should map code 1115 to shipment not found or cannot cancel', () => {
        const result = mapCarrierError(1115, 'some backend message');

        expect(result.userMessage).toBe('Shipment not found or cannot be canceled in current status');
        expect(result.suggestion).toContain('current shipment status');
        expect(result.retryable).toBe(false);
    });

    it('should map code 1125 to service not available', () => {
        const result = mapCarrierError(1125, 'some backend message');

        expect(result.userMessage).toBe('Requested service is not available for this route');
        expect(result.suggestion).toContain('envia_list_carriers');
        expect(result.retryable).toBe(false);
    });

    it('should map code 1127 to field length or branch code', () => {
        const result = mapCarrierError(1127, 'some backend message');

        expect(result.userMessage).toBe('Field value exceeds maximum length or branch code is required');
        expect(result.suggestion).toContain('branch code');
        expect(result.retryable).toBe(false);
    });

    it('should map code 1129 to required fields missing', () => {
        const result = mapCarrierError(1129, 'some backend message');

        expect(result.userMessage).toBe('Required fields are missing for this shipment type');
        expect(result.suggestion).toContain('identification number');
        expect(result.retryable).toBe(false);
    });

    it('should map code 1140 to pricing plan not found', () => {
        const result = mapCarrierError(1140, 'some backend message');

        expect(result.userMessage).toBe('Pricing plan not found for this carrier and route');
        expect(result.suggestion).toContain('Envia support');
        expect(result.retryable).toBe(false);
    });

    it('should map code 1220 to invalid identification format', () => {
        const result = mapCarrierError(1220, 'some backend message');

        expect(result.userMessage).toBe('Invalid format for identification number or postal code');
        expect(result.suggestion).toContain('CPF=11 digits');
        expect(result.retryable).toBe(false);
    });

    it('should map code 1282 to branch does not support COD', () => {
        const result = mapCarrierError(1282, 'some backend message');

        expect(result.userMessage).toBe('Selected pickup branch does not support Cash on Delivery');
        expect(result.suggestion).toContain('COD');
        expect(result.retryable).toBe(false);
    });

    // -----------------------------------------------------------------
    // Fallback behaviour
    // -----------------------------------------------------------------

    it('should return fallback for unknown error code', () => {
        const result = mapCarrierError(9999, 'Something went wrong');

        expect(result.userMessage).toBe('Something went wrong');
        expect(result.suggestion).toBe('Check the request parameters and try again.');
        expect(result.retryable).toBe(true);
    });

    it('should truncate long messages to 200 characters in fallback', () => {
        const longMessage = 'A'.repeat(300);

        const result = mapCarrierError(9999, longMessage);

        expect(result.userMessage).toHaveLength(200);
        expect(result.userMessage).toBe('A'.repeat(200));
    });

    it('should handle empty message string in fallback', () => {
        const result = mapCarrierError(9999, '');

        expect(result.userMessage).toBe('An unexpected error occurred.');
        expect(result.suggestion).toBe('Check the request parameters and try again.');
    });

    it('should mark 5xx codes as retryable in fallback', () => {
        const result = mapCarrierError(500, 'Internal server error');

        expect(result.retryable).toBe(true);
        expect(result.userMessage).toBe('Internal server error');
    });

    // -----------------------------------------------------------------
    // Additional numeric codes added in sprint-0 error-map expansion
    // -----------------------------------------------------------------

    it('should map code 1116 to shipment does not belong to company', () => {
        const result = mapCarrierError(1116, 'backend message');

        expect(result.userMessage).toBe('Shipment does not belong to your company');
        expect(result.suggestion).toContain('not associated with your account');
    });

    it('should map code 1145 to carrier does not support international', () => {
        const result = mapCarrierError(1145, 'backend message');

        expect(result.userMessage).toBe('This carrier does not support international shipments');
        expect(result.suggestion).toContain('FedEx, DHL, UPS');
    });

    it('should map code 1147 to carrier does not support operation', () => {
        const result = mapCarrierError(1147, 'backend message');

        expect(result.userMessage).toBe('Carrier does not support the requested operation');
        expect(result.suggestion).toContain('complement');
    });

    it('should map code 1149 to address cannot be validated', () => {
        const result = mapCarrierError(1149, 'backend message');

        expect(result.userMessage).toBe('Address cannot be validated');
        expect(result.suggestion).toContain('DANE code');
    });

    it('should map code 1300 to coverage not available', () => {
        const result = mapCarrierError(1300, 'backend message');

        expect(result.userMessage).toBe('Coverage not available for this route');
        expect(result.suggestion).toContain('envia_list_carriers');
    });

    it('should map code 900 to invalid action for carrier', () => {
        const result = mapCarrierError(900, 'backend message');

        expect(result.userMessage).toBe('Invalid action for this carrier');
        expect(result.suggestion).toContain('complement');
    });

    // -----------------------------------------------------------------
    // Carrier-specific message pattern matching
    // -----------------------------------------------------------------

    it('should detect DHL street length limit by pattern when code unknown', () => {
        const result = mapCarrierError(9999, 'Street max length exceeded (45)');

        expect(result.userMessage).toBe('DHL requires street address to be 45 characters or fewer');
    });

    it('should detect FedEx residential requirement by pattern', () => {
        const result = mapCarrierError(9999, 'FedEx residential flag required for US domestic');

        expect(result.userMessage).toBe('FedEx requires residential flag for US domestic deliveries');
    });

    it('should detect UPS COD limit by pattern', () => {
        const result = mapCarrierError(9999, 'Cash on delivery exceeds 5000 limit');

        expect(result.userMessage).toBe('COD amount exceeds carrier limit');
    });

    it('should detect Estafeta international restriction by pattern', () => {
        const result = mapCarrierError(9999, 'Estafeta does not support international');

        expect(result.userMessage).toBe('Estafeta does not support international shipments');
    });

    it('should detect Correios minimum declared value by pattern', () => {
        const result = mapCarrierError(9999, 'Correios minimum declared value is 25 BRL');

        expect(result.userMessage).toBe('Correios requires a minimum declared value');
    });

    it('should detect pallet restriction for Coordinadora by pattern', () => {
        const result = mapCarrierError(9999, 'Coordinadora does not accept pallets');

        expect(result.userMessage).toBe('This carrier does not support pallet/LTL shipments');
    });

    it('should detect identification-required pattern', () => {
        const result = mapCarrierError(9999, 'Identification number required for destination');

        expect(result.userMessage).toBe('Identification number is required for this route');
    });

    it('should detect Colombia DANE requirement by pattern', () => {
        const result = mapCarrierError(9999, 'Colombia DANE code invalid for city');

        expect(result.userMessage).toBe('Colombian addresses require a DANE code for city');
    });

    it('should prefer known numeric code over message pattern match', () => {
        // Code 1115 is in ERROR_MAP; message mentions DHL street — numeric wins.
        const result = mapCarrierError(1115, 'Street max length exceeded (45)');

        expect(result.userMessage).toBe('Shipment not found or cannot be canceled in current status');
    });

    // -----------------------------------------------------------------
    // Sprint 3: secondary-carrier error-map entries (Goal 1)
    // -----------------------------------------------------------------

    it('should detect AmPm no-coverage code 260 by pattern', () => {
        const result = mapCarrierError(9999, 'AmPm error 260 no cobertura disponible');

        expect(result.userMessage).toBe('AmPm no tiene cobertura para esta ruta. Prueba otra paquetería o valida origen/destino.');
        expect(result.retryable).toBe(false);
    });

    it('should NOT match AmPm pattern when carrier name is absent', () => {
        const result = mapCarrierError(9999, 'error code 260 without carrier context');

        expect(result.userMessage).not.toBe('AmPm no tiene cobertura para esta ruta. Prueba otra paquetería o valida origen/destino.');
    });

    it('should detect Entrega track-limit exceeded by pattern', () => {
        const result = mapCarrierError(9999, 'Entrega: track limit exceeded for your account');

        expect(result.userMessage).toBe('Entrega alcanzó el límite de rastreos contratados para tu cuenta. Contacta soporte para ampliarlo.');
        expect(result.retryable).toBe(false);
    });

    it('should NOT match Entrega track-limit pattern when carrier name is absent', () => {
        const result = mapCarrierError(9999, 'DHL track limit exceeded');

        expect(result.userMessage).not.toBe('Entrega alcanzó el límite de rastreos contratados para tu cuenta. Contacta soporte para ampliarlo.');
    });

    it('should detect JTExpress ICMS missing for Brazil by pattern', () => {
        const result = mapCarrierError(9999, 'JTExpress ICMS required for this state pair');

        expect(result.userMessage).toBe('JTExpress Brasil requiere cálculo de ICMS para este par de estados. Verifica origen, destino y valor declarado.');
        expect(result.retryable).toBe(false);
    });

    it('should NOT match JTExpress ICMS pattern when carrier name is absent', () => {
        const result = mapCarrierError(9999, 'ICMS required for state pair');

        expect(result.userMessage).not.toBe('JTExpress Brasil requiere cálculo de ICMS para este par de estados. Verifica origen, destino y valor declarado.');
    });

    it('should detect TresGuerras already-canceled via ESTADO_TALON=CANCELADO literal', () => {
        const result = mapCarrierError(9999, 'TresGuerras response: ESTADO_TALON=CANCELADO');

        expect(result.userMessage).toBe('El envío ya fue cancelado en TresGuerras. No es necesario cancelarlo de nuevo.');
        expect(result.retryable).toBe(false);
    });

    it('should NOT match TresGuerras pattern when ESTADO_TALON has a different value', () => {
        const result = mapCarrierError(9999, 'ESTADO_TALON=ACTIVO');

        expect(result.userMessage).not.toBe('El envío ya fue cancelado en TresGuerras. No es necesario cancelarlo de nuevo.');
    });

    it('should detect Afimex insurance cap exceeded by pattern', () => {
        const result = mapCarrierError(9999, 'Afimex insurance exceeds limit of 10000');

        expect(result.userMessage).toBe('Afimex tiene un tope de seguro de $10,000. Reduce el valor asegurado o elige otra paquetería.');
        expect(result.retryable).toBe(false);
    });

    it('should NOT match Afimex insurance pattern when carrier name is absent', () => {
        const result = mapCarrierError(9999, 'insurance exceeds 10000 limit');

        expect(result.userMessage).not.toBe('Afimex tiene un tope de seguro de $10,000. Reduce el valor asegurado o elige otra paquetería.');
    });
});
