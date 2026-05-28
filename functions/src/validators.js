exports.requireAuth = (request) => {
  if (!request.auth) {
    throw new Error("unauthenticated");
  }
};

exports.requireAdminOrStaff = (request) => {
  exports.requireAuth(request);
  const role = request.auth.token.role || 'viewer';
  if (role !== 'admin' && role !== 'staff') {
    throw new Error("permission-denied");
  }
};

exports.requireAdmin = (request) => {
  exports.requireAuth(request);
  const role = request.auth.token.role || 'viewer';
  if (role !== 'admin') {
    throw new Error("permission-denied");
  }
};
