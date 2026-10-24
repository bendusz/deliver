// Form validation helpers. Validators return a list of { field, message }.
export const isBlank = (s) => typeof s !== 'string' || s.trim() === '';
