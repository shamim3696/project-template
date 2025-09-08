import { BadRequestException } from '@nestjs/common';
import mongoose, { Types } from 'mongoose';

export type PaginationData = {
  request: {
    skip: number;
    limit: number;
  };
  pagination:
    | {
        totalItems: number;
        totalPages: number;
        currentPage: number;
        pageSize: number;
      }
    | undefined;
};

export const filterParamsDecoder = (filters: string) => {
  try {
    console.log(filters, 'filters');
    if (!filters) return {};

    const decoded = JSON.parse(filters.replace(/'/g, '"'));

    console.log(decoded, 'decoded');

    const isValidDate = (value: any): boolean =>
      typeof value === 'string' && !isNaN(new Date(value).getTime());

    const parseValue = (field: string, value: any, operator: string) => {
      if (
        typeof value === 'string' &&
        /^[a-fA-F0-9]{24}$/.test(value) &&
        mongoose.isValidObjectId(value)
      ) {
        return new Types.ObjectId(value);
      }

      if (isValidDate(value)) {
        const [year, month, day] = value.split('-').map(Number);
        if (operator === 'day') {
          const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
          const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
          return { $gte: start, $lt: end };
        }

        if (operator === 'month') {
          const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
          const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
          return { $gte: start, $lt: end };
        }

        return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      }

      return value;
    };

    const buildGroup = (group: Record<string, any> | any[]) => {
      const queryParts: any[] = [];

      // Handle array format for OR conditions
      if (Array.isArray(group)) {
        for (const item of group) {
          for (const rawKey in item) {
            const [field, op = 'eq'] = rawKey.split('__');
            const value = item[rawKey];

            console.log(field, op, value);

            const parsed = parseValue(field, value, op);

            let condition = {};
            switch (op) {
              case 'eq':
                condition =
                  typeof parsed === 'object' && parsed.$gte
                    ? { [field]: parsed }
                    : { [field]: parsed };
                break;
              case 'like':
                condition = { [field]: { $regex: value, $options: 'i' } };
                break;
              case 'in':
                const values = Array.isArray(value) ? value : [value];
                condition = {
                  [field]: {
                    $in: values.map((v) => parseValue(field, v, 'eq')),
                  },
                };
                break;
              case 'gt':
                condition = { [field]: { $gt: parsed } };
                break;
              case 'lt':
                condition = { [field]: { $lt: parsed } };
                break;
              case 'gte':
                condition = { [field]: { $gte: parsed } };
                break;
              case 'lte':
                condition = { [field]: { $lte: parsed } };
                break;
              case 'ne':
                condition = { [field]: { $ne: parsed } };
                break;
              case 'month':
                condition = { [field]: { $gte: parsed.$gte, $lt: parsed.$lt } };
                break;
              case 'day':
                condition = { [field]: { $gte: parsed.$gte, $lt: parsed.$lt } };
                break;
            }
            queryParts.push(condition);
          }
        }
      } else {
        // Handle object format (existing logic)
        for (const rawKey in group) {
          const [field, op = 'eq'] = rawKey.split('__');
          const value = group[rawKey];
          const parsed = parseValue(field, value, op);

          console.log(field, op, value);

          console.log(parsed, 'parsed');

          let condition = {};
          switch (op) {
            case 'eq':
              condition =
                typeof parsed === 'object' && parsed.$gte
                  ? { [field]: parsed }
                  : { [field]: parsed };
              break;
            case 'like':
              condition = { [field]: { $regex: new RegExp(value, 'i') } };
              break;
            case 'in':
              const values = Array.isArray(value) ? value : [value];
              condition = {
                [field]: { $in: values.map((v) => parseValue(field, v, 'eq')) },
              };
              break;
            case 'gt':
              condition = { [field]: { $gt: parsed } };
              break;
            case 'lt':
              condition = { [field]: { $lt: parsed } };
              break;
            case 'gte':
              condition = { [field]: { $gte: parsed } };
              break;
            case 'lte':
              condition = { [field]: { $lte: parsed } };
              break;
            case 'ne':
              condition = { [field]: { $ne: parsed } };
              break;
            case 'month':
              condition = { [field]: { $gte: parsed.$gte, $lt: parsed.$lt } };

            case 'day':
              condition = { [field]: { $gte: parsed.$gte, $lt: parsed.$lt } };
          }
          queryParts.push(condition);
        }
      }

      return queryParts;
    };

    const andConditions = buildGroup(decoded.and || {});
    const orConditions = buildGroup(decoded.or || {});

    const query: any = {};
    if (andConditions.length > 0) query.$and = andConditions;
    if (orConditions.length > 0) query.$or = orConditions;

    console.log(JSON.stringify(query, null, 2), 'query');
    return query;
  } catch (e) {
    console.error(e);
    throw { status: 400, message: 'Invalid filter format' };
  }
};

export const extractFieldValue = (
  filter: any,
  fieldName: string,
): string | null => {
  if (!filter) return null;

  const filterObj = JSON.parse(filter.replace(/'/g, '"'));

  let extractedValue: string | null = null;

  const findFieldValue = (obj: any): void => {
    if (obj === null || typeof obj !== 'object' || extractedValue !== null) {
      return; // Stop searching if already found
    }

    if (Array.isArray(obj)) {
      obj.forEach((item) => findFieldValue(item));
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      // Check if this key contains our field name with any operator
      // Examples: businessId__like, businessId__eq, roles.businessRoles.businessId__like
      const keyContainsField =
        key.includes(fieldName + '__') ||
        key === fieldName ||
        key.endsWith('.' + fieldName) ||
        key.includes('.' + fieldName + '__');

      if (keyContainsField) {
        extractedValue = value as string;
        return; // Found it, stop searching
      }

      // Recursively search nested objects
      findFieldValue(value);
    }
  };

  findFieldValue(filterObj);
  return extractedValue;
};

export const sortParamsDecoder = (
  sort: string,
): { [key: string]: 1 | -1 } | undefined => {
  try {
    if (!sort || sort.length === 0) return undefined;
    console.log(sort, 'sort');
    const decoded = sort.startsWith('[')
      ? JSON.parse(sort.replace(/'/g, '"'))
      : [sort];

    console.log(decoded, 'decoded');

    const sortFormat: { [key: string]: 1 | -1 } = {};

    decoded.forEach((item: string) => {
      const sortOrder = item.startsWith('+') ? 1 : -1;
      const fieldName = item.substring(1); // Remove the '+' or '-' prefix
      sortFormat[fieldName] = sortOrder;
    });

    return sortFormat;
  } catch (error) {
    console.log(error);
    throw { status: 400, message: 'Bad Sort Format' };
  }
};

export function getNonFilterableFields(
  filters: any,
  fields: string[],
): string[] | null {
  const nonFilterableFields: string[] = [];

  console.log(filters, 'filters');

  console.log(Object.keys(filters));

  // Helper function to recursively check fields
  const checkFields = (filter: any) => {
    Object.keys(filter).forEach((key) => {
      if (key === '$or' || key === '$and') {
        // Ignore MongoDB logical operators
        filter[key].forEach((subFilter: any) => checkFields(subFilter));
      } else if (!fields.includes(key)) {
        nonFilterableFields.push(key);
      }
    });
  };

  filters && checkFields(filters);

  if (nonFilterableFields.length > 0) {
    const message =
      nonFilterableFields.length === 1
        ? 'Bad Format:Field is not Filterable: ' + nonFilterableFields[0]
        : 'Fields are not Filterable: ' + nonFilterableFields.join(', ');
    throw new BadRequestException(message);
  }

  return nonFilterableFields.length > 0 ? nonFilterableFields : null;
}

export const queryToPagination = (query: any) => {
  const page = parseInt(query.page);
  const pageSize = parseInt(query.length);
  const skip = (page - 1) * pageSize;
  const limit = pageSize;
  return { request: { skip, limit } } as PaginationData;
};

export const resultToPagination = (
  totalItems: number,
  pagination: PaginationData,
) => {
  const currentPage =
    pagination?.request?.skip / pagination?.request?.limit + 1 || 1;
  const pageSize = pagination?.request?.limit || 10;
  pagination.pagination = {
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
    currentPage,
    pageSize,
  };
  return pagination;
};