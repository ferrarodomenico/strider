import { BuilderField, Operator, RelativeRange, TimeMode } from './view.types';

export interface BuilderRow {
  id: string;
  field: BuilderField;
  operator: Operator;
  value: string;
  connector?: 'AND' | 'OR';
  timeMode?: TimeMode;
  relativeRange?: RelativeRange;
}

export interface FieldDef {
  field: BuilderField;
  label: string;
  valueInput: 'text' | 'number' | 'select-kind' | 'select-status' | 'time';
  operators: Operator[];
}
