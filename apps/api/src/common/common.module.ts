import { Global, Module } from '@nestjs/common';
import { ExportService } from './export/export.service';

/** App-wide stateless helpers (file export). */
@Global()
@Module({
  providers: [ExportService],
  exports: [ExportService],
})
export class CommonModule {}
