<?php

namespace App\Filament\Resources;

use App\Filament\Resources\ApprovalResource\Pages;
use App\Models\Approval;
use Filament\Forms;
use Filament\Tables;
use Filament\Resources\Form;
use Filament\Resources\Table;
use Filament\Resources\Resource;

class ApprovalResource extends Resource
{
    protected static ?string $model = Approval::class;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('requisition_id')
                    ->relationship('requisition', 'id')
                    ->required(),
                Forms\Components\Select::make('approved_by')
                    ->relationship('approver', 'name')
                    ->required(),
                Forms\Components\Select::make('status')
                    ->options([
                        'approved' => 'Approved',
                        'rejected' => 'Rejected',
                    ])
                    ->required(),
                Forms\Components\Textarea::make('remarks'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('requisition.id')->label('Requisition'),
                Tables\Columns\TextColumn::make('approver.name')->label('Approver'),
                Tables\Columns\TextColumn::make('status')->badge(),
                Tables\Columns\TextColumn::make('created_at')->date(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListApprovals::route('/'),
            'create' => Pages\CreateApproval::route('/create'),
        ];
    }
}
