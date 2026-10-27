const useAppSettings = () => {
  let settings = {};
  settings['idurar_app_email'] = 'noreply@toblo.com';
  settings['idurar_base_url'] = 'https://cloud.idurarapp.com';
  return settings;
};

module.exports = useAppSettings;
