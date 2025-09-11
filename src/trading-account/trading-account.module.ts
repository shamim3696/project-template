import { Module } from '@nestjs/common';
import { TradingAccountController } from './trading-account.controller';
import { TradingAccountService } from './trading-account.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  tradingAccount,
  tradingAccountSchema,
} from 'src/common/schema/tradingAccount.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: tradingAccount.name, schema: tradingAccountSchema },
    ]),
  ],
  controllers: [TradingAccountController],
  providers: [TradingAccountService],
})
export class TradingAccountModule {}
