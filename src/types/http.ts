export interface ApiErrorBody {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}