import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ required: true, enum: ['DEPOSIT', 'WITHDRAW'] })
  transactionType: 'DEPOSIT' | 'WITHDRAW';

  @Prop({ required: true, type: Number, min: 0 })
  amount: number;

  @Prop()
  description?: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Account' })
  accountId: Types.ObjectId;

  @Prop()
  dealId?: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
