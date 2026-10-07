import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserId } from '../common/decorators/user-id.decorator';
import { UserIdGuard } from '../common/guards/user-id.guard';
import { CreateItemDto } from './dto/create-item.dto';
import { ShoppingItem } from './interfaces/shopping-item.interface';
import { ItemsService } from './items.service';

@Controller('items')
@UseGuards(UserIdGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  async findAll(@UserId() userId: string): Promise<{ items: ShoppingItem[] }> {
    return { items: await this.itemsService.findAll(userId) };
  }

  @Post()
  create(@UserId() userId: string, @Body() dto: CreateItemDto): Promise<ShoppingItem> {
    return this.itemsService.create(userId, dto);
  }

  @Patch(':itemId/toggle')
  toggle(@UserId() userId: string, @Param('itemId') itemId: string): Promise<ShoppingItem> {
    return this.itemsService.toggle(userId, itemId);
  }

  // Must be declared before ':itemId' so "bought" is not captured as an item ID.
  @Delete('bought')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearBought(@UserId() userId: string): Promise<void> {
    await this.itemsService.clearBought(userId);
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@UserId() userId: string, @Param('itemId') itemId: string): Promise<void> {
    return this.itemsService.remove(userId, itemId);
  }
}
