import { ValidateBy, type ValidationArguments, type ValidationOptions } from 'class-validator';

/**
 * Checks that a confirm-password field equals the same object's `password`.
 * Shared by every create DTO that accepts confirmPassword (Team Lead,
 * Auditor) so the rule and its message are defined once. The password
 * policy itself stays on CreateUserDto.password.
 */
export function MatchesPassword(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'matchesPassword',
      validator: {
        validate: (value: unknown, args?: ValidationArguments) =>
          value === (args?.object as { password?: unknown } | undefined)?.password,
        defaultMessage: () => 'Passwords do not match',
      },
    },
    validationOptions,
  );
}
