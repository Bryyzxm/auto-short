<?php

namespace App\Filament\Resources;

use App\Filament\Resources\RequisitionResource\Pages;
use App\Models\Requisition;
use Filament\Forms;
use Filament\Tables;
use Filament\Resources\Form;
use Filament\Resources\Table;
use Filament\Resources\Resource;

class RequisitionResource extends Resource
{
    protected static ?string $model = Requisition::class;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('vendor_id')
                    ->relationship('vendor', 'name')
                    ->searchable()
                    ->required(),
                Forms\Components\Textarea::make('item_description')
                    ->required(),
                Forms\Components\TextInput::make('quantity')
                    ->numeric()
                    ->default(1)
                    ->required(),
                Forms\Components\DatePicker::make('required_by'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('user.name')->label('Requested By'),
                Tables\Columns\TextColumn::make('vendor.name'),
                Tables\Columns\TextColumn::make('status')->badge(),
                Tables\Columns\TextColumn::make('created_at')->date(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')
                    ->options([
                        'pending' => 'Pending',
                        'approved' => 'Approved',
                        'rejected' => 'Rejected',
                    ]),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListRequisitions::route('/'),
            'create' => Pages\CreateRequisition::route('/create'),
            'view' => Pages\ViewRequisition::route('/{record}'),
        ];
    }
}
