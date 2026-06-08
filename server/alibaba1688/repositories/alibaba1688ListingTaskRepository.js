import { createAlibaba1688Repository } from './alibaba1688RepositoryFactory.js';

export const alibaba1688ListingTaskRepository = createAlibaba1688Repository({
  tableName: '"1688_listing_tasks"',
  fields: [
    'id',
    'productId',
    'assigneeUserId',
    'storeId',
    'taskTitle',
    'taskStatus',
    'dueDate',
    'startedAt',
    'completedAt',
    'listingUrl',
    'failureReason',
    'createdBy',
    'createdAt',
    'updatedAt',
    'remark',
  ],
  defaults: {
    taskTitle: '',
    taskStatus: 'pending',
  },
  requiredFields: ['productId'],
  searchColumns: ['task_title', 'listing_url', 'failure_reason'],
  filterColumns: {
    productId: 'product_id',
    assigneeUserId: 'assignee_user_id',
    storeId: 'store_id',
    taskStatus: 'task_status',
    createdBy: 'created_by',
  },
});
