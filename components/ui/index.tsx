'use client';

/**
 * The UI barrel.
 *
 * Every component is imported from '@/components/ui' regardless of which file
 * it lives in, so the library can be reorganized without touching a single
 * call site. Each group below is one file.
 */

export { Button } from '@/components/ui/button';
export { buttonStyles } from '@/components/ui/button-styles';
export { Pagination } from '@/components/ui/pagination';

export { Card, CardHeader, CardBody, Label } from '@/components/ui/card';
export { Input, Textarea, Select, Field, Switch } from '@/components/ui/form';
export { Badge, StatusDot, Table, Th, Td, Tr, EmptyState } from '@/components/ui/data';
export { Modal, ConfirmDialog } from '@/components/ui/overlay';
export { Toast, useToast } from '@/components/ui/toast';
export { PageHeader, Tabs, Spinner, LoadingBlock, ErrorBlock } from '@/components/ui/layout';
