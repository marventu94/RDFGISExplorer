import {
  IsString,
  IsIn,
  IsObject,
  Length,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isNonEmptyObject', async: false })
class IsNonEmptyObjectConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a non-empty object`;
  }
}

@ValidatorConstraint({ name: 'payloadSize', async: false })
class PayloadSizeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return true;
    try {
      const serialized = JSON.stringify(value);
      return serialized.length <= 1024 * 1024;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} serialized size must not exceed 1 MB`;
  }
}

export class CreateDashboardDto {
  @IsIn(['gis', 'explorer'])
  kind!: 'gis' | 'explorer';

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsObject()
  @Validate(IsNonEmptyObjectConstraint)
  @Validate(PayloadSizeConstraint)
  payload!: object;
}
