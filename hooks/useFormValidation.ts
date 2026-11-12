import { useState, useCallback } from 'react';

export interface ValidationRule {
    validate: (value: unknown) => boolean;
    message: string;
}

export interface FieldValidation {
    [field: string]: ValidationRule[];
}

export interface ValidationErrors {
    [field: string]: string | null;
}

export const useFormValidation = <T extends Record<string, unknown>>(
    rules: FieldValidation
) => {
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [touched, setTouched] = useState<Set<string>>(new Set());

    const validateField = useCallback((field: string, value: unknown): string | null => {
        const fieldRules = rules[field];
        if (!fieldRules) return null;

        for (const rule of fieldRules) {
            if (!rule.validate(value)) {
                return rule.message;
            }
        }
        return null;
    }, [rules]);

    const validateAll = useCallback((values: T): boolean => {
        const newErrors: ValidationErrors = {};
        let isValid = true;

        for (const field of Object.keys(rules)) {
            const error = validateField(field, values[field]);
            if (error) {
                newErrors[field] = error;
                isValid = false;
            }
        }

        setErrors(newErrors);
        return isValid;
    }, [rules, validateField]);

    const setFieldError = useCallback((field: string, error: string | null) => {
        setErrors(prev => ({ ...prev, [field]: error }));
    }, []);

    const touchField = useCallback((field: string) => {
        setTouched(prev => new Set(prev).add(field));
    }, []);

    const validateOnBlur = useCallback((field: string, value: unknown) => {
        touchField(field);
        const error = validateField(field, value);
        setFieldError(field, error);
        return error === null;
    }, [validateField, setFieldError, touchField]);

    const clearErrors = useCallback(() => {
        setErrors({});
        setTouched(new Set());
    }, []);

    const getFieldState = useCallback((field: string) => ({
        error: touched.has(field) ? errors[field] : null,
        touched: touched.has(field),
        isValid: !errors[field]
    }), [errors, touched]);

    return {
        errors,
        touched,
        validateField,
        validateAll,
        validateOnBlur,
        setFieldError,
        touchField,
        clearErrors,
        getFieldState
    };
};

// Common validation rules
export const validationRules = {
    required: (message = 'This field is required'): ValidationRule => ({
        validate: (value) => value !== null && value !== undefined && value !== '',
        message
    }),
    min: (min: number, message?: string): ValidationRule => ({
        validate: (value) => typeof value === 'number' && value >= min,
        message: message || `Value must be at least ${min}`
    }),
    max: (max: number, message?: string): ValidationRule => ({
        validate: (value) => typeof value === 'number' && value <= max,
        message: message || `Value must be at most ${max}`
    }),
    positive: (message = 'Value must be positive'): ValidationRule => ({
        validate: (value) => typeof value === 'number' && value > 0,
        message
    }),
    email: (message = 'Invalid email address'): ValidationRule => ({
        validate: (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message
    }),
    minLength: (min: number, message?: string): ValidationRule => ({
        validate: (value) => typeof value === 'string' && value.length >= min,
        message: message || `Must be at least ${min} characters`
    })
};
