🧪 AccountDeletionService error path tests

🎯 **What:** The `AccountDeletionService.request_account_deletion` lacked an error path test. A test file `backend/tests/test_account_deletion_service.py` was introduced to verify that when the repository raises a `ValueError` or a `SQLAlchemyError`, the service correctly throws an `AppError` with a 400 status.
📊 **Coverage:** Covered both `ValueError` and `SQLAlchemyError` error paths, as well as the happy path success scenario.
✨ **Result:** Improved test coverage and reliability for the account deletion functionality.
