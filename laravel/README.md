# Laravel Filament Requisition Management System

This directory contains a basic example of a requisition management system built with Laravel and Filament. It demonstrates how purchase requests can be submitted, approved, and tracked.

## Features

- **Request Submission**: Employees submit requisitions specifying vendor, item details, quantity, and required date.
- **Approval Workflow**: Approvals are stored in a separate table and can be processed via Filament.
- **Vendor Management**: Simple vendor directory.

## Setup

1. Install PHP dependencies via Composer.
2. Run `php artisan migrate` to create the database tables.
3. Install Filament admin panel and create a user with the `filament` role.

Refer to the files inside the `app/` and `database/` directories for code examples.
