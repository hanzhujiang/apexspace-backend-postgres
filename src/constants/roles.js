const ROLES = {
  OWNER:       'owner',
  ADMIN:       'admin',
  MANAGER:     'manager',
  EMPLOYEE:    'employee',
  CREATE_ONLY: 'create_only',
  READ_ONLY:   'read_only',
};

const ALL_ROLES = Object.values(ROLES);
const NON_OWNER_ROLES = ALL_ROLES.filter((r) => r !== ROLES.OWNER);

module.exports = { ROLES, ALL_ROLES, NON_OWNER_ROLES };
