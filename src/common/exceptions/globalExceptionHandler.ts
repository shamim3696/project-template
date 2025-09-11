import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';
import mongoose from 'mongoose';
import {
  JsonWebTokenError,
  TokenExpiredError,
  NotBeforeError,
} from 'jsonwebtoken';

interface ErrorResponse {
  success: false;
  error: {
    type: string;
    message: string | string[];
    code?: string;
    timestamp: string;
    path: string;
    method: string;
    details?: any;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const errorInfo = this.formatException(exception);
    const timestamp = new Date().toISOString();

    // Enhanced logging with more context
    this.logger.error(
      `❌ [${request.method}] ${request.url} → ${errorInfo.status}`,
      {
        error: errorInfo.type,
        message: errorInfo.message,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        body: this.sanitizeRequestBody(request.body),
        query: request.query,
        timestamp,
      },
    );

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        type: errorInfo.type,
        message: errorInfo.message,
        code: errorInfo.code,
        timestamp,
        path: request.url,
        method: request.method,
        ...(process.env.NODE_ENV === 'development' &&
          errorInfo.details && {
            details: errorInfo.details,
          }),
      },
    };

    response.status(errorInfo.status).send(errorResponse);
  }

  private formatException(exception: unknown): {
    status: number;
    message: string | string[];
    type: string;
    code?: string;
    details?: any;
  } {
    // 🔹 Handle NestJS HttpException
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string' ? response : (response as any).message;

      return {
        status,
        message,
        type: exception.constructor.name,
        code: `HTTP_${status}`,
      };
    }

    // 🔹 Handle JWT Errors
    if (this.isJWTError(exception)) {
      return this.handleJWTError(exception);
    }

    // 🔹 Handle Mongoose Errors (Primary focus)
    if (this.isMongooseError(exception)) {
      return this.handleMongooseError(exception);
    }

    // 🔹 Handle MongoDB Driver Errors
    if (this.isMongoDBDriverError(exception)) {
      return this.handleMongoDBDriverError(exception);
    }

    // 🔹 Handle Axios Errors
    if (this.isAxiosError(exception)) {
      return this.handleAxiosError(exception);
    }

    // 🔹 Handle Validation Errors (class-validator)
    if (this.isValidationError(exception)) {
      return this.handleValidationError(exception);
    }

    // 🔹 Handle File System Errors
    if (this.isFileSystemError(exception)) {
      return this.handleFileSystemError(exception);
    }

    // 🔹 Handle Network/Connection Errors
    if (this.isNetworkError(exception)) {
      return this.handleNetworkError(exception);
    }

    // 🔹 Handle Permission/Access Errors
    if (this.isPermissionError(exception)) {
      return this.handlePermissionError(exception);
    }

    // 🔹 Handle Rate Limiting Errors
    if (this.isRateLimitError(exception)) {
      return this.handleRateLimitError(exception);
    }

    // 🔹 Handle native JavaScript errors
    if (exception instanceof Error) {
      return this.handleNativeError(exception);
    }

    // 🔹 Fallback for unknown errors
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      type: 'UnknownError',
      code: 'UNKNOWN_ERROR',
      details: process.env.NODE_ENV === 'development' ? exception : undefined,
    };
  }

  // JWT Error Handlers
  private isJWTError(exception: any): boolean {
    return (
      exception instanceof JsonWebTokenError ||
      exception instanceof TokenExpiredError ||
      exception instanceof NotBeforeError ||
      exception?.name === 'JsonWebTokenError' ||
      exception?.name === 'TokenExpiredError' ||
      exception?.name === 'NotBeforeError'
    );
  }

  private handleJWTError(exception: any) {
    if (
      exception instanceof TokenExpiredError ||
      exception?.name === 'TokenExpiredError'
    ) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        message: 'Token has expired',
        type: 'TokenExpiredError',
        code: 'TOKEN_EXPIRED',
      };
    }

    if (
      exception instanceof NotBeforeError ||
      exception?.name === 'NotBeforeError'
    ) {
      return {
        status: HttpStatus.UNAUTHORIZED,
        message: 'Token not active yet',
        type: 'TokenNotActiveError',
        code: 'TOKEN_NOT_ACTIVE',
      };
    }

    return {
      status: HttpStatus.UNAUTHORIZED,
      message: 'Invalid token',
      type: 'InvalidTokenError',
      code: 'INVALID_TOKEN',
    };
  }

  // Enhanced Mongoose Error Handlers
  private isMongooseError(exception: any): boolean {
    // Check for standard Mongoose errors
    const standardMongooseErrors = [
      'ValidationError',
      'CastError',
      'DocumentNotFoundError',
      'VersionError',
      'ParallelSaveError',
      'StrictModeError',
      'OverwriteModelError',
      'MissingSchemaError',
    ];

    // Check for connection-related errors
    const connectionErrors = [
      'DisconnectedError',
      'MongooseServerSelectionError',
      'MongoServerSelectionError',
      'MongoNetworkError',
      'MongoTimeoutError',
    ];

    return (
      exception instanceof mongoose.Error.ValidationError ||
      exception instanceof mongoose.Error.CastError ||
      exception instanceof mongoose.Error.DocumentNotFoundError ||
      exception instanceof mongoose.Error.VersionError ||
      exception instanceof mongoose.Error.ParallelSaveError ||
      exception instanceof mongoose.Error.StrictModeError ||
      exception instanceof mongoose.Error.OverwriteModelError ||
      exception instanceof mongoose.Error.MissingSchemaError ||
      standardMongooseErrors.includes(exception?.name) ||
      connectionErrors.includes(exception?.name) ||
      exception?.constructor?.name?.includes('Mongoose') ||
      exception?.message?.includes('mongoose')
    );
  }

  private handleMongooseError(exception: any) {
    // Validation Error
    if (
      exception instanceof mongoose.Error.ValidationError ||
      exception?.name === 'ValidationError'
    ) {
      const messages = Object.values(exception.errors || {}).map(
        (error: any) => {
          if (error.kind === 'required') {
            return `${error.path} is required`;
          }
          if (error.kind === 'enum') {
            return `${error.path} must be one of: ${error.properties?.enumValues?.join(', ')}`;
          }
          if (error.kind === 'minlength') {
            return `${error.path} must be at least ${error.properties?.minlength} characters long`;
          }
          if (error.kind === 'maxlength') {
            return `${error.path} must not exceed ${error.properties?.maxlength} characters`;
          }
          if (error.kind === 'min') {
            return `${error.path} must be at least ${error.properties?.min}`;
          }
          if (error.kind === 'max') {
            return `${error.path} must not exceed ${error.properties?.max}`;
          }
          if (error.kind === 'unique') {
            return `${error.path} must be unique`;
          }
          return error.message || `Validation failed for ${error.path}`;
        },
      );

      return {
        status: HttpStatus.BAD_REQUEST,
        message: messages.length > 0 ? messages : ['Validation failed'],
        type: 'ValidationError',
        code: 'VALIDATION_ERROR',
        details:
          process.env.NODE_ENV === 'development' ? exception.errors : undefined,
      };
    }

    // Cast Error (Invalid ObjectId, type conversion)
    if (
      exception instanceof mongoose.Error.CastError ||
      exception?.name === 'CastError'
    ) {
      const field = exception.path;
      const value = exception.value;

      if (exception.kind === 'ObjectId') {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Invalid ${field} format`,
          type: 'CastError',
          code: 'INVALID_OBJECT_ID',
        };
      }

      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Invalid ${field}: ${value}`,
        type: 'CastError',
        code: 'INVALID_FORMAT',
      };
    }

    // Document Not Found Error
    if (
      exception instanceof mongoose.Error.DocumentNotFoundError ||
      exception?.name === 'DocumentNotFoundError'
    ) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Document not found',
        type: 'DocumentNotFoundError',
        code: 'DOCUMENT_NOT_FOUND',
      };
    }

    // Version Error (Optimistic concurrency)
    if (
      exception instanceof mongoose.Error.VersionError ||
      exception?.name === 'VersionError'
    ) {
      return {
        status: HttpStatus.CONFLICT,
        message: 'Document was modified by another process',
        type: 'VersionError',
        code: 'DOCUMENT_VERSION_CONFLICT',
      };
    }

    // Parallel Save Error
    if (
      exception instanceof mongoose.Error.ParallelSaveError ||
      exception?.name === 'ParallelSaveError'
    ) {
      return {
        status: HttpStatus.CONFLICT,
        message: 'Cannot save document multiple times in parallel',
        type: 'ParallelSaveError',
        code: 'PARALLEL_SAVE_ERROR',
      };
    }

    // Strict Mode Error
    if (
      exception instanceof mongoose.Error.StrictModeError ||
      exception?.name === 'StrictModeError'
    ) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Field '${exception.path}' is not defined in schema`,
        type: 'StrictModeError',
        code: 'FIELD_NOT_IN_SCHEMA',
      };
    }

    // Disconnected Error
    if (exception?.name === 'DisconnectedError') {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database connection lost',
        type: 'DisconnectedError',
        code: 'DATABASE_DISCONNECTED',
      };
    }

    // Server Selection Error
    if (
      exception?.name === 'MongooseServerSelectionError' ||
      exception?.name === 'MongoServerSelectionError'
    ) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Cannot connect to database server',
        type: 'ServerSelectionError',
        code: 'DATABASE_CONNECTION_FAILED',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Database operation failed',
      type: 'MongooseError',
      code: 'DATABASE_ERROR',
      details:
        process.env.NODE_ENV === 'development' ? exception.message : undefined,
    };
  }

  // MongoDB Driver Error Handlers
  private isMongoDBDriverError(exception: any): boolean {
    return (
      this.isMongoDuplicateKeyError(exception) ||
      this.isMongoWriteConcernError(exception) ||
      this.isMongoTimeoutError(exception) ||
      this.isMongoNetworkError(exception) ||
      this.isMongoAuthError(exception)
    );
  }

  private handleMongoDBDriverError(exception: any) {
    // Duplicate Key Error (E11000)
    if (this.isMongoDuplicateKeyError(exception)) {
      const keyValue = exception.keyValue || {};
      const duplicateFields = Object.keys(keyValue);

      if (duplicateFields.length === 1) {
        const field = duplicateFields[0];
        const value = keyValue[field];
        return {
          status: HttpStatus.CONFLICT,
          message: `The ${field} "${value}" is already in use`,
          type: 'DuplicateKeyError',
          code: 'DUPLICATE_KEY',
        };
      }

      return {
        status: HttpStatus.CONFLICT,
        message: 'Duplicate entry found',
        type: 'DuplicateKeyError',
        code: 'DUPLICATE_KEY',
        details: process.env.NODE_ENV === 'development' ? keyValue : undefined,
      };
    }

    // Write Concern Error
    if (this.isMongoWriteConcernError(exception)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Write operation failed due to write concern',
        type: 'WriteConcernError',
        code: 'WRITE_CONCERN_ERROR',
      };
    }

    // Timeout Error
    if (this.isMongoTimeoutError(exception)) {
      return {
        status: HttpStatus.REQUEST_TIMEOUT,
        message: 'Database operation timed out',
        type: 'TimeoutError',
        code: 'DATABASE_TIMEOUT',
      };
    }

    // Network Error
    if (this.isMongoNetworkError(exception)) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database network error',
        type: 'NetworkError',
        code: 'DATABASE_NETWORK_ERROR',
      };
    }

    // Authentication Error
    if (this.isMongoAuthError(exception)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database authentication failed',
        type: 'AuthenticationError',
        code: 'DATABASE_AUTH_ERROR',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'MongoDB driver error',
      type: 'MongoDriverError',
      code: 'MONGO_DRIVER_ERROR',
    };
  }

  // Axios Error Handler
  private isAxiosError(exception: any): boolean {
    return (
      exception?.isAxiosError === true ||
      (exception?.config &&
        exception?.request &&
        exception?.response !== undefined) ||
      exception?.name === 'AxiosError'
    );
  }

  private handleAxiosError(exception: any) {
    const status = exception.response?.status || HttpStatus.BAD_GATEWAY;
    const message =
      (exception.response?.data as any)?.message ||
      exception.message ||
      'External service error';

    return {
      status,
      message,
      type: 'ExternalServiceError',
      code: `EXTERNAL_SERVICE_${status}`,
    };
  }

  // Validation Error Handler
  private isValidationError(exception: any): boolean {
    return (
      exception?.name === 'ValidationError' && Array.isArray(exception.details)
    );
  }

  private handleValidationError(exception: any) {
    const messages = exception.details?.map(
      (detail: any) => detail.message,
    ) || ['Validation failed'];
    return {
      status: HttpStatus.BAD_REQUEST,
      message: messages,
      type: 'ValidationError',
      code: 'VALIDATION_ERROR',
    };
  }

  // File System Error Handler
  private isFileSystemError(exception: any): boolean {
    return (
      exception?.code &&
      ['ENOENT', 'EACCES', 'EMFILE', 'ENOTDIR'].includes(exception.code)
    );
  }

  private handleFileSystemError(exception: any) {
    const errorMap: Record<string, { status: number; message: string }> = {
      ENOENT: {
        status: HttpStatus.NOT_FOUND,
        message: 'File or directory not found',
      },
      EACCES: { status: HttpStatus.FORBIDDEN, message: 'Permission denied' },
      EMFILE: {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Too many open files',
      },
      ENOTDIR: { status: HttpStatus.BAD_REQUEST, message: 'Not a directory' },
    };

    const errorInfo = errorMap[exception.code] || {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'File system error',
    };

    return {
      ...errorInfo,
      type: 'FileSystemError',
      code: exception.code,
    };
  }

  // Network Error Handler
  private isNetworkError(exception: any): boolean {
    return (
      exception?.code &&
      ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].includes(
        exception.code,
      )
    );
  }

  private handleNetworkError(exception: any) {
    const errorMap: Record<string, { status: number; message: string }> = {
      ECONNREFUSED: {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Connection refused',
      },
      ETIMEDOUT: {
        status: HttpStatus.REQUEST_TIMEOUT,
        message: 'Connection timeout',
      },
      ENOTFOUND: { status: HttpStatus.NOT_FOUND, message: 'Host not found' },
      ECONNRESET: {
        status: HttpStatus.BAD_GATEWAY,
        message: 'Connection reset',
      },
    };

    const errorInfo = errorMap[exception.code] || {
      status: HttpStatus.BAD_GATEWAY,
      message: 'Network error',
    };

    return {
      ...errorInfo,
      type: 'NetworkError',
      code: exception.code,
    };
  }

  // Permission Error Handler
  private isPermissionError(exception: any): boolean {
    return (
      exception?.message?.toLowerCase().includes('permission') ||
      exception?.code === 'EPERM'
    );
  }

  private handlePermissionError(exception: any) {
    return {
      status: HttpStatus.FORBIDDEN,
      message: 'Insufficient permissions',
      type: 'PermissionError',
      code: 'PERMISSION_DENIED',
    };
  }

  // Rate Limit Error Handler
  private isRateLimitError(exception: any): boolean {
    return (
      exception?.message?.toLowerCase().includes('rate limit') ||
      exception?.status === 429
    );
  }

  private handleRateLimitError(exception: any) {
    return {
      status: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Rate limit exceeded',
      type: 'RateLimitError',
      code: 'RATE_LIMIT_EXCEEDED',
    };
  }

  // Native Error Handler
  private handleNativeError(exception: Error) {
    const errorTypeMap: Record<string, { status: number; message: string }> = {
      TypeError: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Type error occurred',
      },
      ReferenceError: {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Reference error occurred',
      },
      SyntaxError: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Syntax error in request',
      },
      RangeError: {
        status: HttpStatus.BAD_REQUEST,
        message: 'Value out of range',
      },
    };

    const errorInfo = errorTypeMap[exception.constructor.name] || {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: exception.message || 'Internal server error',
    };

    return {
      ...errorInfo,
      type: exception.constructor.name,
      code: 'NATIVE_ERROR',
      details:
        process.env.NODE_ENV === 'development' ? exception.stack : undefined,
    };
  }

  // MongoDB Driver Helper Methods
  private isMongoDuplicateKeyError(exception: any): boolean {
    return (
      exception &&
      typeof exception === 'object' &&
      exception.code === 11000 &&
      'keyValue' in exception
    );
  }

  private isMongoWriteConcernError(exception: any): boolean {
    return exception?.name === 'WriteConcernError' || exception?.code === 64;
  }

  private isMongoTimeoutError(exception: any): boolean {
    return (
      exception?.name === 'MongoTimeoutError' ||
      exception?.code === 50 ||
      exception?.message?.includes('timeout')
    );
  }

  private isMongoNetworkError(exception: any): boolean {
    return (
      exception?.name === 'MongoNetworkError' ||
      exception?.name === 'MongoNetworkTimeoutError' ||
      exception?.code === 89
    );
  }

  private isMongoAuthError(exception: any): boolean {
    return (
      exception?.name === 'MongoAuthenticationError' ||
      exception?.code === 18 ||
      exception?.code === 13
    );
  }

  private sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'auth',
      'authorization',
    ];
    const sanitized = { ...body };

    Object.keys(sanitized).forEach((key) => {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}
