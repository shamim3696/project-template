import {
  AggregateOptions,
  ClientSession,
  FilterQuery,
  Model,
  PipelineStage,
  PopulateOptions,
  SortOrder,
} from 'mongoose';
import {
  filterParamsDecoder,
  getNonFilterableFields,
  queryToPagination,
  resultToPagination,
  sortParamsDecoder,
} from '../utils/paramsDecoder';

type SimpleCollationOptions = {
  locale: string;
  caseLevel?: boolean;
  caseFirst?: string;
  strength?: number;
  numericOrdering?: boolean;
  alternate?: string;
  maxVariable?: string;
  backwards?: boolean;
};

type SimpleReadPreference =
  | 'primary'
  | 'primaryPreferred'
  | 'secondary'
  | 'secondaryPreferred'
  | 'nearest';

interface GetAllParams {
  filter: any;
  sortStr: string;
  page: string;
  length: string;
  filterableFields?: string[];
  aggregationPipeline?: PipelineStage[];
  projectStage?: PipelineStage;
  useAggregation?: boolean;
  excludeFields?: string[];
  useLean?: boolean;
  // Enhanced options
  session?: ClientSession;
  allowDiskUse?: boolean;
  maxTimeMS?: number;
  readPreference?: SimpleReadPreference;
  readConcern?: { level: string };
  hint?: string | Record<string, any>;
  collation?: SimpleCollationOptions;
}

interface FindParams {
  filters?: Record<string, any>;
  sort?: Record<string, SortOrder>;
  limit?: number;
  skip?: number;
  populate?: PopulateOptions | (string | PopulateOptions)[];
  useLean?: boolean;
  select?: string | string[];
  // Enhanced options
  session?: ClientSession;
  maxTimeMS?: number;
  hint?: string | Record<string, any>;
  collation?: SimpleCollationOptions;
  batchSize?: number;
  comment?: string;
}

export type Pagination =
  | {
      totalItems: number;
      totalPages: number;
      currentPage: number;
      pageSize: number;
    }
  | undefined;

export class BaseRepository<T> {
  constructor(protected readonly model: Model<T>) {}

  async findAll(
    data: Partial<T>,
    projection?: Record<string, number | 0 | 1> | string,
  ): Promise<T[] | null | any> {
    return this.model
      .find({ ...data, isDeleted: false })
      .select(projection || '-password') // if projection not given, exclude password
      .lean()
      .exec();
  }

  async find(filter: any = {}, projection?: any): Promise<T[] | null | any> {
    const defaultExclusions = { password: 0 };

    return this.model
      .find({ ...filter, isDeleted: false })
      .select(
        projection
          ? { ...defaultExclusions, ...projection }
          : defaultExclusions,
      )
      .lean()
      .exec();
  }

  async getBusinessUser(data: any): Promise<T | null | any> {
    return this.model
      .find(data, { isDeleted: false })
      .select({
        password: 0,
        kycDocumentBack: 0,
        kycDocumentFront: 0,
        kycDocumentId: 0,
        kycDocumentType: 0,
        createdAt: 0,
        updatedAt: 0,
        gender: 0,
        birthday: 0,
        address: 0,
        country: 0,
        currency: 0,
        accStatus: 0,
        kycStatus: 0,
        twoFactorStatus: 0,
        twoFactorSecret: 0,
        name: 0,
        __v: 0,
        isDeleted: 0,
        businesses: 0,
      })
      .lean()
      .exec();
  }

  async findById(id: string): Promise<T | null | any> {
    return this.model.findById(id).lean().exec();
  }

  async findOne(
    data: Partial<T>,
    projection?: string | Record<string, number>,
  ): Promise<T | null | any> {
    const query = this.model.findOne({ ...data, isDeleted: false });

    // Apply projection only if provided
    if (projection) {
      query.select(projection);
    } else {
      query.select('-password'); // default projection if none provided
    }

    return query.lean().exec();
  }

  async findPassword(id: string): Promise<T | null | any> {
    return this.model.findOne({ _id: id, isDeleted: false }).lean().exec();
  }

  async findLastOne(): Promise<T | null | any> {
    return this.model
      .findOne()
      .select('-password')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async create(data: any): Promise<T | any> {
    return this.model.create(data);
  }

  async update(id: string, data: Partial<T>): Promise<T | null | any> {
    return this.model
      .findByIdAndUpdate(id, { ...data, isDeleted: false }, { new: true })
      .lean()
      .exec();
  }

  async findAndUpdateOne(id: string, data: any): Promise<T | null | any> {
    return this.model
      .findOneAndUpdate(
        { _id: id },
        { ...data, isDeleted: false },
        { new: true },
      )
      .lean()
      .exec();
  }

  async delete(id: string): Promise<T | null | any> {
    return this.model
      .findByIdAndUpdate(id, { isDeleted: true }, { new: true })
      .lean()
      .exec();
  }

  async getAllData(
    params: GetAllParams,
  ): Promise<{ data: T[]; pagination: Pagination }> {
    const DEFAULT_EXCLUDE_FIELDS = ['isDeleted', '__v'];
    const {
      filter,
      page,
      length,
      sortStr = '-createdAt',
      filterableFields = [],
      aggregationPipeline = [],
      projectStage,
      useAggregation = false,
      excludeFields = [],
      useLean = false,
      session,
      allowDiskUse,
      maxTimeMS,
      readPreference,
      readConcern,
      hint,
      collation,
    } = params;

    const filters = filterParamsDecoder(filter);
    const sort = sortParamsDecoder(sortStr);
    const paginationParams = queryToPagination({ page, length });

    const { skip, limit } = paginationParams.request;

    getNonFilterableFields(filters, filterableFields);

    const mergedExcludeFields = Array.from(
      new Set([...DEFAULT_EXCLUDE_FIELDS, ...excludeFields]),
    );

    const baseFilter = {
      ...filters,
      isDeleted: { $ne: true },
    };

    if (useAggregation) {
      const unsetStage = {
        $unset: mergedExcludeFields,
      };

      // Build the facet pipeline with proper typing
      const dataStages = [
        { $sort: sort || {} },
        { $skip: skip },
        { $limit: limit },
        ...(projectStage ? [projectStage] : []),
        unsetStage,
      ];

      const totalCountStages = [{ $count: 'count' }];

      const facetStage = {
        $facet: {
          data: dataStages,
          totalCount: totalCountStages,
        },
      };

      const pipeline = [
        ...aggregationPipeline,
        { $match: baseFilter },
        facetStage,
      ];

      const aggregationOptions: AggregateOptions = {};
      if (session) aggregationOptions.session = session;
      if (allowDiskUse) aggregationOptions.allowDiskUse = allowDiskUse;
      if (readPreference) aggregationOptions.readPreference = readPreference;
      if (hint) aggregationOptions.hint = hint;
      if (collation) aggregationOptions.collation = collation;

      const result = await this.aggregate(
        pipeline as PipelineStage[],
        aggregationOptions,
      );

      const data = result[0]?.data || [];
      const totalCount = result[0]?.totalCount[0]?.count || 0;

      const paginationResult = resultToPagination(totalCount, paginationParams);

      return { data, pagination: paginationResult.pagination };
    } else {
      const query = this.model
        .find(baseFilter as FilterQuery<T>)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select(mergedExcludeFields.map((f) => `-${f}`).join(' '));

      if (useLean) query.lean();
      if (session) query.session(session);
      if (maxTimeMS) query.maxTimeMS(maxTimeMS);
      if (hint) query.hint(hint);
      if (collation) query.collation(collation as any);

      const countQuery = this.model.countDocuments(
        baseFilter as FilterQuery<T>,
      );
      if (session) countQuery.session(session);

      const [data, totalCount] = await Promise.all([
        query.exec(),
        countQuery.exec(),
      ]);

      const paginationResult = resultToPagination(totalCount, paginationParams);

      return { data, pagination: paginationResult.pagination };
    }
  }

  async aggregate<R = any>(
    pipeline: PipelineStage[],
    options: AggregateOptions = {},
  ): Promise<R[]> {
    const aggregation = this.model.aggregate(pipeline);

    if (options.session) aggregation.session(options.session);
    if (options.allowDiskUse) aggregation.allowDiskUse(options.allowDiskUse);
    if (options.readPreference) aggregation.read(options.readPreference as any);
    if (options.hint) aggregation.hint(options.hint);
    if (options.collation) aggregation.collation(options.collation as any);

    return aggregation.exec();
  }
}
