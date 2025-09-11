import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AccountDocument = tradingAccount & Document;

@Schema({ timestamps: true })
export class tradingAccount {
  @Prop({ required: true })
  accountNumber: string;

  @Prop({ required: true })
  accountName: string;

  @Prop({ required: true, enum: ['USER', 'BUSINESS'] })
  holderType: string;

  @Prop({ required: true })
  holderId: string;

  @Prop({ required: true })
  group: string;

  @Prop({ required: true })
  leverage: number;

  @Prop({ required: true })
  loginId: string;

  @Prop({ required: true })
  password: string;
}

export const tradingAccountSchema = SchemaFactory.createForClass(tradingAccount);
