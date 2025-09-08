import { Multipart } from '@fastify/multipart';
import { S3Service } from '../lib/aws/aws.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PartsDataFormatter {
  constructor(private readonly s3Service: S3Service) {}

  async formatPartsData(parts: any) {
    const formattedData: Record<string, any> = {};

    for await (const part of parts) {
      if (part.type === 'file') {
        const { fileName, url } = await this.s3Service.uploadFile(part);
        formattedData[part.fieldname] = fileName;
      } else if (part.type === 'field') {
        formattedData[part.fieldname] = part.value;
      }
    }
    return formattedData;
  }
}