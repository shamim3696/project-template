import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exceptions/globalExceptionHandler';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(AllExceptionsFilter);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
