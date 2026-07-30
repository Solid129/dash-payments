import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { toCsv } from '../../common/csv';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../user/user.schema';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { TransactionListItem, TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiCookieAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List transactions',
    description:
      'Filterable, searchable, and cursor-paginated. `totals` covers everything matching the ' +
      'filters rather than just the returned page, so the UI can show a summary without a second call.',
  })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryTransactionsDto) {
    return this.transactions.list(user.merchantId, query);
  }

  // Declared before ':id' — Nest matches routes in order, and 'export' would
  // otherwise be captured by ':id' and rejected by ParseUUIDPipe as an
  // invalid uuid before this handler is ever reached.
  @Get('export')
  @Roles(UserRole.OWNER, UserRole.ACCOUNTANT)
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Export transactions as CSV',
    description: 'Same filters as the list endpoint (cursor/limit are ignored); returns every matching row.',
  })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryTransactionsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const rows = await this.transactions.listForExport(user.merchantId, query);
    const csv = toCsv<TransactionListItem>(rows, [
      { header: 'Date', value: (r) => r.createdAt.toISOString() },
      { header: 'Reference', value: (r) => r.reference },
      { header: 'Type', value: (r) => r.type },
      { header: 'Status', value: (r) => r.status },
      { header: 'Customer Name', value: (r) => r.customer?.name },
      { header: 'Customer Email', value: (r) => r.customer?.email },
      { header: 'Method', value: (r) => r.method },
      { header: 'Description', value: (r) => r.description },
      { header: 'Gross Amount', value: (r) => (r.amountMinor / 100).toFixed(2) },
      { header: 'Fee', value: (r) => (r.feeMinor / 100).toFixed(2) },
      { header: 'Net Amount', value: (r) => (r.netMinor / 100).toFixed(2) },
      { header: 'Currency', value: (r) => r.currency },
    ]);

    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Transaction detail with timeline and refunds' })
  @ApiResponse({
    status: 404,
    description: 'Not found, or owned by a different merchant — the two are indistinguishable by design.',
  })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    // Rejects a malformed id at the edge, so a bad path segment is a clean 400
    // rather than a database error.
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactions.findOne(user.merchantId, id);
  }
}
