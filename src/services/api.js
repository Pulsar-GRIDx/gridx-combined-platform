/**
 * GRIDx Combined Platform — API Service
 * Connects React frontend to the Express backend
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/cb';

function getHeaders() {
  const token = sessionStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: getHeaders(),
    ...options,
  });

  if (res.status === 401) {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }

  return res.json();
}

// ===== IN-MEMORY CACHE LAYER =====
const _cache = new Map();

const CACHE_TTL = {
  '/loadcontrol/meters-state': 30000,
  '/loadcontrol/network-summary': 10000,
  '/loadcontrol/grid-topology': 60000,
  '/loadcontrol/groups': 30000,
  '/energy-analytics/substation-config': 60000,
  '/energy-analytics/power-flow': 60000,
  '/energy-analytics/regional-summary': 60000,
  '/energy-analytics/district-stats': 60000,
  '/energy-analytics/suburb-boundaries': 300000,
  '/meters-information': 30000,
  '/meters-information-basic': 30000,
  '/meters-list': 30000,
  '/meter-summary': 30000,
  '/activeInactiveMeters': 30000,
  '/totalMeters': 60000,
  '/total-tranformers': 120000,
  '/meterPercentageCount': 30000,
  '/meterLocation/getAll': 60000,
  '/transformer/getAll': 120000,
  '/areaSummary': 60000,
  '/energy-time-periods': 30000,
  '/currentDayEnergy': 15000,
  '/weeklyDataAmount': 30000,
  '/yearly/currentAndLastYearMonthEnergyTotal': 60000,
  '/weekly/currentAndLastWeekEnergyTotal': 60000,
  '/hourlyPowerConsumption': 30000,
  '/average-current-voltage': 30000,
  '/last-apparent-power': 30000,
  '/finance/time-periods': 30000,
  '/finance/currentAndLastYearMonthRevenueTotal': 60000,
  '/finance/currentAndLastWeek': 60000,
  '/finance/hourlyRevenue': 30000,
  '/finance/pastWeekTokens': 60000,
  '/finance/energy-overview': 60000,
  '/tokenAmount': 30000,
  '/totalTokensBought': 30000,
  '/get-system-processed-tokens': 60000,
  '/get-all-token-entries': 60000,
  '/hourly-token-counts': 30000,
  '/powerIncreaseOrDecrease': 30000,
  '/tokenAmountIncreaseOrDecrease': 30000,
  '/vending/dashboard': 30000,
  '/vending/tariffs/config': 60000,
  '/vending/tariffs/groups': 60000,
  '/vending/vendors': 60000,
  '/vending/arrears': 30000,
  '/vending/arrears/summary': 30000,
  '/vending/dsm': 60000,
  '/vending/reports/revenue-by-area': 60000,
  '/vending/reports/meter-status': 60000,
  '/tamper/summary': 30000,
  '/tamper/fleet-summary': 30000,
  '/mqtt/status': 10000,
  '/mqtt/dashboard-stats': 15000,
  '/mqtt/meters-health-summary': 30000,
  '/mqtt/net-energy/dashboard': 30000,
  '/mqtt/net-energy/active-meters': 30000,
  '/mqtt/net-metering-configs': 60000,
  '/systemSettings': 120000,
  '/allAdmins': 60000,
  '/allUsers': 60000,
  '/integration/partners': 60000,
  '/integration/api-stats': 30000,
  '/postpaid/summary': 30000,
  '/postpaid/prepaid-meters': 30000,
  '/postpaid/postpaid-meters': 30000,
  '/postpaid/all-meters': 30000,
  '/postpaid/prepaid-tariff-rates': 60000,
  '/postpaid/postpaid-tariffs': 60000,
  '/meter-config/meter-profiles': 60000,
  '/installers': 60000,
};
const DEFAULT_TTL = 20000;

function getCacheTTL(url) {
  for (const key of Object.keys(CACHE_TTL)) {
    if (url === key || url.startsWith(key + '/') || url.startsWith(key + '?')) return CACHE_TTL[key];
  }
  return DEFAULT_TTL;
}

const INVALIDATION_MAP = {
  '/loadcontrol/': ['/loadcontrol/'],
  '/vending/': ['/vending/'],
  '/meter': ['/meters-', '/meter', '/totalMeters', '/activeInactive', '/meterPercentage', '/meterLocation', '/areaSummary'],
  '/postpaid/': ['/postpaid/'],
  '/integration/': ['/integration/'],
  '/systemSettings': ['/systemSettings'],
  '/admin': ['/allAdmins', '/allUsers', '/adminAuth'],
};

function invalidateCache(url) {
  for (const [prefix, patterns] of Object.entries(INVALIDATION_MAP)) {
    if (url.includes(prefix)) {
      for (const [cacheKey] of _cache) {
        if (patterns.some(p => cacheKey.includes(p))) {
          _cache.delete(cacheKey);
        }
      }
      return;
    }
  }
  _cache.clear();
}

function get(url) {
  const entry = _cache.get(url);
  const now = Date.now();
  if (entry && now - entry.ts < entry.ttl) {
    if (now - entry.ts > entry.ttl * 0.7) {
      request(url).then(data => {
        _cache.set(url, { data, ts: Date.now(), ttl: entry.ttl });
      }).catch(() => {});
    }
    return Promise.resolve(entry.data);
  }
  return request(url).then(data => {
    _cache.set(url, { data, ts: Date.now(), ttl: getCacheTTL(url) });
    return data;
  });
}

function post(url, body) {
  return request(url, { method: 'POST', body: JSON.stringify(body) }).then(data => {
    invalidateCache(url);
    return data;
  });
}

function put(url, body) {
  return request(url, { method: 'PUT', body: JSON.stringify(body) }).then(data => {
    invalidateCache(url);
    return data;
  });
}

function del(url) {
  return request(url, { method: 'DELETE' }).then(data => {
    invalidateCache(url);
    return data;
  });
}

export function clearApiCache() {
  _cache.clear();
}

async function uploadFile(url, formData) {
  const token = sessionStorage.getItem('token');
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Upload failed (${res.status})`);
  }
  return res.json();
}

// ===== AUTH =====
export const authAPI = {
  login: (Email, Password) => post('/signin', { Email, Password }),
  verify2FALogin: (Admin_ID, code, tempToken) => post('/verify-2fa-login', { Admin_ID, code, tempToken }),
  signup: (data) => post('/adminSignup', data),
  getProfile: (id) => get(`/profile/${id}`),
  getAdminData: (id) => get(`/adminData/${id}`),
  getAllAdmins: () => get('/allAdmins'),
  getAllUsers: () => get('/allUsers'),
  updateAdmin: (id, data) => post(`/AdminUpdate/${id}`, data),
  updateUser: (id, data) => post(`/UserUpdate/${id}`, data),
  deleteAdmin: (id) => del(`/deleteAdmin/${id}`),
  deleteUser: (id) => del(`/deleteUser/${id}`),
  updateAdminStatus: (id) => post(`/updateStatus/${id}`),
  resetPassword: (id, Password) => post(`/resetPassword/${id}`, { Password }),
  unlockAccount: (id) => post(`/unlockAccount/${id}`),
  forgotPassword: (Email) => post('/forgot-password', { Email }),
  verifyPin: (Email, pin) => post('/verify-pin', { Email, pin }),
  resetForgottenPassword: (Email, pin, newPassword) =>
    post('/reset-forgotten-password', { Email, pin, newPassword }),
  getAccessLevel: () => get('/adminAuth/accessLevel'),
  // 2FA management
  setup2FA: () => post('/2fa/setup', {}),
  enable2FA: (code) => post('/2fa/enable', { code }),
  disable2FA: (adminId) => post(adminId ? `/2fa/disable/${adminId}` : '/2fa/disable', {}),
  // Platform Audit Log
  getPlatformAuditLog: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/platform-audit-log${q ? '?' + q : ''}`);
  },
  clearPlatformAuditLog: () => del('/platform-audit-log'),
  // Installer management
  getAllInstallers: () => get('/installers'),
};

// ===== METERS =====
export const meterAPI = {
  getAll: () => get('/meters-information'),
  getAllBasic: () => get('/meters-information-basic'),
  getList: () => get('/meters-list'),
  getDashboard: () => get('/meter-summary'),
  getActiveInactive: () => get('/activeInactiveMeters'),
  getTotal: () => get('/totalMeters'),
  getByDRN: (drn) => get(`/meterWeekAndMonthData${drn}`),
  getDailyEnergy: (drn) => get(`/meterDataByDRN${drn}`),
  getProfileByDRN: (drn) => get(`/meterDataByDRN/${drn}`),
  getTokensByDRN: (drn) => get(`/allProcessedTokensByDRN${drn}`),
  getTopology: (cities) => post('/gridTopology', { cities }),
  getTotalTransformers: () => get('/total-tranformers'),
  // Real-time telemetry
  getPower: (drn) => get(`/meterPower/getLastUpdate/${drn}`),
  getEnergy: (drn) => get(`/meterEnergy/getLastUpdate/${drn}`),
  getLoadControl: (drn) => get(`/meterLoadControl/getLastUpdate/${drn}`),
  getCellNetwork: (drn) => get(`/meterCellNetwork/getLastUpdate/${drn}`),
  getWeekMonthData: (drn) => get(`/meterWeekAndMonthData/${drn}`),
  getStsTokens: (drn) => get(`/stsTokensByDRN/${drn}`),
  // Locations for map
  getLocation: (drn) => get(`/meterLocation/${drn}`),
  getAllLocations: () => get('/meterLocation/getAll'),
  getAllTransformers: () => get('/transformer/getAll'),
  getMetersByTransformer: (drn) => get(`/meterLocation/getMeterByTrans/${drn}`),
  getNotifications: (drn) => get(`/notificationsByDRN/${drn}`),
  getAreaSummary: () => get('/areaSummary'),
  getDailyPower: (drn) => get(`/meterDailyPower/${drn}`),
  getPowerByDate: (drn, year, month, day) => get(`/meterPower/getByDRNAndDate/${year}/${month}/${day}/${drn}`),
  getPower15min: (drn) => get(`/summary/power15min/${drn}`),
};

// ===== LOAD CONTROL =====
export const loadControlAPI = {
  getMainsControl: (drn) => get(`/meterMainsControl/getLastUpdate/${drn}`),
  getHeaterControl: (drn) => get(`/meterHeaterControl/getLastUpdate/${drn}`),
  getMainsState: (drn) => get(`/meterMainsState/getLastUpdate/${drn}`),
  getHeaterState: (drn) => get(`/meterHeaterState/getLastUpdate/${drn}`),
  setMains: (drn, state, user, reason) =>
    post(`/meterMainsControl/update/${drn}`, { state, user, reason }),
  setHeater: (drn, state, user, reason) =>
    post(`/meterHeaterControl/update/${drn}`, { state, user, reason }),
  setMainsState: (drn, state, user, reason) =>
    post(`/meterMainsState/update/${drn}`, { state, user, reason }),
  setHeaterState: (drn, state, user, reason) =>
    post(`/meterHeaterState/update/${drn}`, { state, user, reason }),
};

// ===== ENERGY =====
export const energyAPI = {
  getTimePeriods: () => get('/energy-time-periods'),
  getCurrentDay: () => get('/currentDayEnergy'),
  getWeeklyAmount: () => get('/weeklyDataAmount'),
  getMonthlyYearly: () => get('/yearly/currentAndLastYearMonthEnergyTotal'),
  getWeekly: () => get('/weekly/currentAndLastWeekEnergyTotal'),
  getHourlyPower: () => get('/hourlyPowerConsumption'),
  getAvgCurrentVoltage: () => get('/average-current-voltage'),
  getApparentPower: () => get('/last-apparent-power'),
  getSuburbTimePeriods: (suburbs) => post('/suburb-time-periods', { suburbs }),
  getSuburbWeeklyPower: (suburbs) => post('/search-by-weekly-power', { suburbs }),
  getSuburbMonthlyPower: (suburbs) => post('/search-by-monthly-power', { suburbs }),
  getSuburbHourlyEnergy: (suburbs) => post('/getSuburbHourlyEnergy', { suburbs }),
  getSuburbEnergy: (suburbs) => post('/getSuburbEnergy', { suburbs }),
  getPowerIncreaseOrDecrease: () => get('/powerIncreaseOrDecrease'),
  getSuburbPowerIncreaseOrDecrease: (suburbs) => post('/suburbAdvancedPowerIncreaseOrDecrease', { suburbs }),
  getHourlyByDrn: (drn) => get(`/getHourlyDataByDrn/${drn}`),
};

// ===== FINANCIAL =====
export const financeAPI = {
  getTimePeriods: () => get('/finance/time-periods'),
  getMonthlyYearly: () => get('/finance/currentAndLastYearMonthRevenueTotal'),
  getWeekly: () => get('/finance/currentAndLastWeek'),
  getHourlyRevenue: () => get('/finance/hourlyRevenue'),
  getRevenueByPeriod: (period) => get('/finance/revenueByPeriod?period=' + (period || 'weekly')),
  getSuburbTimePeriod: (suburbs) => post('/finance/suburbTimePeriod', { suburbs }),
  getSuburbWeekly: (suburbs) => post('/finance/suburbWeeklyRevenue', { suburbs }),
  getSuburbYearly: (suburbs) => post('/finance/suburbYearlyRevenue', { suburbs }),
  getPastWeekTokens: () => get('/finance/pastWeekTokens'),
  getEnergyOverview: () => get('/finance/energy-overview'),
  getSuburbChartRevenue: (suburbs) => post('/finance/getSuburbChartRevenue', { suburbs }),
  getTokenAmountIncreaseOrDecrease: () => get('/tokenAmountIncreaseOrDecrease'),
  getSuburbRevenueIncreaseOrDecrease: (suburbs) => post('/suburbRevenueIncreaseOrDecrease', { suburbs }),
};

// ===== TOKENS =====
export const tokenAPI = {
  getAmount: () => get('/tokenAmount'),
  getCount: () => get('/totalTokensBought'),
  getAllProcessed: () => get('/get-system-processed-tokens'),
  getAllTokenEntries: () => get('/get-all-token-entries'),
  getHourlyTokenCounts: () => get('/hourly-token-counts'),
};

// ===== NOTIFICATIONS =====
export const notificationAPI = {
  getAll: () => get('/getAll'),
  getCritical: () => get('/criticalNotifications'),
  getByDRN: (drn) => get(`/notificationsByDRN/${drn}`),
  getTypes: () => get('/notificationTypes'),
  getTypesByDRN: (drn) => get(`/notificationsTypesByDRN/${drn}`),
  getEmergency: () => get('/emergencyNotifications'),
  respond: (id, data) => post(`/respond/${id}`, data),
  delete: (id) => del(`/deleteNotifications/${id}`),
};

// ===== METER PERCENTAGES =====
export const meterPercentageAPI = {
  get: () => get('/meterPercentageCount'),
};

// ===== SYSTEM SETTINGS =====
export const settingsAPI = {
  get: () => get('/systemSettings'),
  update: (data) => post('/systemSettings', data),
};

// ===== METER CONFIGURATION =====
export const meterConfigAPI = {
  resetBLE: (drn, reason, user) => post(`/meterResetBLE/update/${drn}`, { state: 1, processed: 0, reason: reason || 'Web UI', user: user || 'Admin' }),
  resetAuthNumbers: (drn, reason, user) => post(`/meterResetAuthNumber/update/${drn}`, { state: 1, processed: 0, reason: reason || 'Web UI', user: user || 'Admin' }),
  resetMeter: (drn, reason, user) => post(`/meterReset/update/${drn}`, { state: 1, processed: 0, reason: reason || 'Web UI', user: user || 'Admin' }),
  // Relay controls
  setMainsControl: (drn, state) => post(`/meterMainsControl/update/${drn}`, { state, processed: 0, reason: 'Web UI' }),
  setHeaterControl: (drn, state) => post(`/meterHeaterControl/update/${drn}`, { state, processed: 0, reason: 'Web UI' }),
  setMainsState: (drn, state) => post(`/meterMainsState/update/${drn}`, { state, processed: 0, reason: 'Web UI' }),
  setHeaterState: (drn, state) => post(`/meterHeaterState/update/${drn}`, { state, processed: 0, reason: 'Web UI' }),
  // Token
  sendToken: (drn, tokenId) => post(`/meterSendSTSToken/update/${drn}`, { token_ID: tokenId, processed: 0 }),
  // Authorized number
  addAuthNumber: (drn, number) => post(`/meter-config/auth-number/${drn}`, { number }),
  // SMS config
  setSMSResponse: (drn, number, enabled) => post(`/smsResponse/update/${drn}`, { sms_response_number: number, sms_response_enabled: enabled ? 1 : 0, processed: 0 }),
  // Sleep mode
  setSleepMode: (drn, enabled) => post(`/meter-config/sleep/${drn}`, { sleep_mode_enabled: enabled ? 1 : 0, processed: 0 }),
  // Base URL
  setBaseUrl: (drn, url) => post(`/meter-config/base-url/${drn}`, { base_url: url }),
  // Get current config status
  getStatus: (drn) => get(`/meter-config/status/${drn}`),
  // Meter profiles
  getMeterProfiles: () => get('/meter-config/meter-profiles'),
  // Authorized numbers
  getAuthorizedNumbers: (drn) => get(`/meterAuthorizedNumbers/${drn}`),
  // Calibration
  calibrate: (drn, action) => post(`/calibrate/${drn}`, { action }),
  clearTamper: (drn, user) => post(`/clear-tamper/${drn}`, { user: user || 'Admin' }),
  getCalibrationLog: (drn) => get(`/calibration-log/${drn}`),
};

// ===== METER BILLING =====
export const billingAPI = {
  getConfig: (drn) => get(`/meter-billing/config/${drn}`),
  setPrepaid: (data) => post('/meter-billing/config/prepaid', data),
  setPostpaid: (data) => post('/meter-billing/config/postpaid', data),
  setTier: (data) => post('/meter-billing/config/tier', data),
};

// ===== POSTPAID BILLING =====
export const postpaidAPI = {
  getSummary: () => get('/postpaid/summary'),
  getPrepaidMeters: () => get('/postpaid/prepaid-meters'),
  getPostpaidMeters: () => get('/postpaid/postpaid-meters'),
  getPostpaidBills: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/postpaid/postpaid-bills${q ? '?' + q : ''}`);
  },
  generateBill: (data) => post('/postpaid/generate-bill', data),
  recordPayment: (data) => post('/postpaid/record-payment', data),
  switchMode: (data) => post('/postpaid/switch-mode', data),
  getModeHistory: (drn) => get(`/postpaid/mode-history/${drn}`),
  getAllMeters: () => get('/postpaid/all-meters'),
  // Tariff management
  getPrepaidTariffRates: () => get('/postpaid/prepaid-tariff-rates'),
  applyPrepaidTariff: (data) => post('/postpaid/apply-prepaid-tariff', data),
  getPostpaidTariffs: () => get('/postpaid/postpaid-tariffs'),
  savePostpaidTariff: (data) => post('/postpaid/postpaid-tariffs', data),
  deletePostpaidTariff: (id) => del(`/postpaid/postpaid-tariffs/${id}`),
};

// ===== METER PROFILE =====
export const meterProfileAPI = {
  get: () => get('/settings/meterProfile'),
  update: (data) => post('/settings/meterProfile', data),
};

// ===== TAMPER DETECTION =====
export const tamperAPI = {
  getSummary: () => get('/tamper/summary'),
  getPhysicalEvents: (days) => get('/tamper/physical' + (days ? '?days=' + days : '')),
  getConfirmed: (days) => get('/tamper/analytical/confirmed' + (days ? '?days=' + days : '')),
  getSuspected: (days) => get('/tamper/analytical/suspected' + (days ? '?days=' + days : '')),
  getFleetSummary: (days) => get('/tamper/fleet-summary' + (days ? '?days=' + days : '')),
};

// ===== VSM TESTING =====
export const vsmAPI = {
  getKeys: () => get('/vsm/keys'),
  saveKey: (data) => post('/vsm/keys', data),
  deleteKey: (id) => del('/vsm/keys/' + id),
  serverGenerate: (data) => post('/vsm/server-generate', data),
  logComparison: (data) => post('/vsm/log-comparison', data),
  getTestHistory: (limit) => get('/vsm/test-history' + (limit ? '?limit=' + limit : '')),
};

// ===== COMMISSION REPORTS =====
export const commissionReportAPI = {
  getByDRN: (drn) => get(`/settings/commissionReports/${drn}`),
  getLatest: (drn) => get(`/settings/commissionReport/latest/${drn}`),
  getById: (id) => get(`/settings/commissionReport/${id}`),
  saveGeyserDetection: (data) => post('/commission-report/geyser-detection', data),
  getGeyserDetections: (drn) => get(`/settings/geyserDetections/${drn}`),
};

// ===== HOME CLASSIFICATION =====
export const homeClassificationAPI = {
  getByDRN: (drn) => get(`/settings/homeClassifications/${drn}`),
  getLatest: (drn) => get(`/settings/homeClassification/latest/${drn}`),
  getById: (id) => get(`/settings/homeClassification/${id}`),
};

// ===== METER HEALTH (computed from MQTT power/energy data) =====
export const meterHealthAPI = {
  getLatest: (drn) => get(`/mqtt/meter-health/${drn}`),
  getHistory: (drn, limit = 72) => get(`/mqtt/meter-health/${drn}/history?limit=${limit}`),
  getAllSummary: () => get('/mqtt/meters-health-summary'),
};

// ===== RELAY EVENTS (from MQTT relay_log) =====
export const relayEventsAPI = {
  getEvents: (drn, { limit = 100, offset = 0, relay, type } = {}) => {
    let url = `/mqtt/relay-events/${drn}?limit=${limit}&offset=${offset}`;
    if (relay !== undefined && relay !== '') url += `&relay=${relay}`;
    if (type !== undefined && type !== '') url += `&type=${type}`;
    return get(url);
  },
  getSummary: (drn, hours = 168) => get(`/mqtt/relay-events/${drn}/summary?hours=${hours}`),
};

// ===== MQTT ACTIVITY LOG =====
export const mqttActivityAPI = {
  getLog: (drn, limit = 20) => get(`/mqtt/activity-log/${drn}?limit=${limit}`),
};

// ===== METER REGISTRATION =====
export const meterRegistrationAPI = {
  register: (data) => post('/meter-registration', data),
  insertMeter: (data) => post('/insertMeterData', data),
  insertTransformer: (data) => post('/insertTransformer', data),
};

// ===== GROUP CONTROL / LOAD MANAGEMENT =====
export const groupControlAPI = {
  getGroups: () => get('/loadcontrol/groups'),
  getGroup: (id) => get(`/loadcontrol/groups/${id}`),
  createGroup: (data) => post('/loadcontrol/groups', data),
  updateGroup: (id, data) => put(`/loadcontrol/groups/${id}`, data),
  deleteGroup: (id) => del(`/loadcontrol/groups/${id}`),
  addMeters: (groupId, meters) => post(`/loadcontrol/groups/${groupId}/meters`, { meters }),
  removeMeters: (groupId, meters) => post(`/loadcontrol/groups/${groupId}/meters/remove`, { meters }),
  execute: (data) => post('/loadcontrol/execute', data),
  getHistory: () => get('/loadcontrol/history'),
  getMetersState: () => get('/loadcontrol/meters-state'),
  getNetworkSummary: () => get('/loadcontrol/network-summary'),
  randomize: (data) => post('/loadcontrol/randomize', data),
};

// ===== MQTT =====
export const mqttAPI = {
  getStatus: () => get('/mqtt/status'),
  sendCommand: (drn, command) => post(`/mqtt/command/${drn}`, command),
  testPublish: (drn) => post('/mqtt/test-publish', { drn }),
  getLiveStatus: (threshold) => get(`/mqtt/live-status${threshold ? '?threshold=' + threshold : ''}`),
  getDashboardStats: () => get('/mqtt/dashboard-stats'),
  // Credit transfers
  listTransfers: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/mqtt/credit-transfers${q ? '?' + q : ''}`);
  },
  transferCredit: (drn, data) => post(`/mqtt/credit-transfer/${drn}`, data),
  getTransferStatus: (drn, id) => get(`/mqtt/credit-transfer/${drn}/status/${id}`),
};

// ===== SUBURB ENERGY =====
export const suburbAPI = {
  getEnergy: (suburbs) => post('/suburbEnergy', { suburbs }),
};

// ===== VENDING (STS) =====
export const vendingAPI = {
  // Dashboard
  getDashboard: () => get('/vending/dashboard'),
  // Customers
  getCustomers: (params) => {
    const q = new URLSearchParams(params).toString();
    return get(`/vending/customers${q ? '?' + q : ''}`);
  },
  getCustomerByMeter: (meterNo) => get(`/vending/customers/${meterNo}`),
  createCustomer: (data) => post('/vending/customers', data),
  updateCustomer: (id, data) => put(`/vending/customers/${id}`, data),
  getAreas: () => get('/vending/customers/areas/list'),
  // Vending
  vendToken: (data) => post('/vending/vend', data),
  issueFreeToken: (data) => post('/vending/free-token', data),
  // Transactions
  getTransactions: (params) => {
    const q = new URLSearchParams(params).toString();
    return get(`/vending/transactions${q ? '?' + q : ''}`);
  },
  getTransaction: (id) => get(`/vending/transactions/${id}`),
  reverseTransaction: (id, reason) => post(`/vending/transactions/${id}/reverse`, { reason }),
  reprintToken: (id) => post(`/vending/transactions/${id}/reprint`, {}),
  // Vendors
  getVendors: () => get('/vending/vendors'),
  getVendor: (id) => get(`/vending/vendors/${id}`),
  createVendor: (data) => post('/vending/vendors', data),
  updateVendor: (id, data) => put(`/vending/vendors/${id}`, data),
  deleteVendor: (id) => del(`/vending/vendors/${id}`),
  getVendorCommission: (id) => get(`/vending/vendors/${id}/commission`),
  generateVendorApiKey: (id) => post(`/vending/vendors/${id}/generate-api-key`, {}),
  activateVendorApi: (id, environment) => post(`/vending/vendors/${id}/activate-api`, { environment }),
  // Batches
  getSalesBatches: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/vending/batches/sales${q ? '?' + q : ''}`);
  },
  createSalesBatch: (data) => post('/vending/batches/sales', data),
  closeSalesBatch: (id, data) => post(`/vending/batches/sales/${id}/close`, data || {}),
  getBankingBatches: () => get('/vending/batches/banking'),
  createBankingBatch: (data) => post('/vending/batches/banking', data),
  reconcileBankingBatch: (id, data) => post(`/vending/batches/banking/${id}/reconcile`, data || {}),
  // Tariffs
  getTariffConfig: () => get('/vending/tariffs/config'),
  updateTariffConfig: (data) => put('/vending/tariffs/config', data),
  getTariffGroups: () => get('/vending/tariffs/groups'),
  createTariffGroup: (data) => post('/vending/tariffs/groups', data),
  updateTariffGroup: (id, data) => put(`/vending/tariffs/groups/${id}`, data),
  deleteTariffGroup: (id) => del(`/vending/tariffs/groups/${id}`),
  seedWindhoekTariffs: () => post('/vending/tariffs/seed-windhoek'),
  // TOU Schedules
  getTOUSchedule: (groupId) => get(`/vending/tariffs/groups/${groupId}/tou-schedule`),
  updateTOUSchedule: (groupId, schedule) => put(`/vending/tariffs/groups/${groupId}/tou-schedule`, { schedule }),
  getCurrentTOUPeriod: (groupId) => get(`/vending/tariffs/groups/${groupId}/current-period`),
  // Push tariff to meters
  pushTariffToMeter: (drn, tariffGroup) => post(`/vending/tariffs/push/${drn}`, { tariffGroup }),
  pushTariffToAll: (tariffGroup) => post('/vending/tariffs/push-all', { tariffGroup }),
  getMetersByGroup: (groupId) => get(`/vending/tariffs/groups/${groupId}/meters`),
  getAllMetersWithTariff: () => get('/vending/tariffs/all-meters'),
  assignTariff: (drn, tariffGroup, reason) => post(`/vending/tariff-assign/${drn}`, { tariffGroup, reason }),
  assignTariffToSelected: (drns, tariffGroup) => post('/vending/tariff-assign-selected', { drns, tariffGroup }),
  bulkAssignTariff: (tariffGroup) => post('/vending/tariff-assign-bulk', { tariffGroup }),
  getTariffHistory: (drn) => get(`/vending/tariff-history/${drn}`),
  getTariffInfo: (drn) => get(`/vending/tariff-info/${drn}`),
  // DSM Configuration
  getDSMConfig: (drn) => get(`/vending/dsm/${drn}`),
  getAllDSMConfig: () => get('/vending/dsm'),
  updateDSMConfig: (drn, data) => put(`/vending/dsm/${drn}`, data),
  // Arrears
  getArrears: () => get('/vending/arrears'),
  setArrears: (meterNo, amount) => post(`/vending/arrears/${meterNo}`, { amount }),
  getArrearsSummary: () => get('/vending/arrears/summary'),
  // Audit
  getAuditLog: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/vending/audit${q ? '?' + q : ''}`);
  },
  // Reports
  getDailySalesReport: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/vending/reports/daily-sales${q ? '?' + q : ''}`);
  },
  getRevenueByAreaReport: () => get('/vending/reports/revenue-by-area'),
  getVendorPerformanceReport: () => get('/vending/reports/vendor-performance'),
  getMeterStatusReport: () => get('/vending/reports/meter-status'),
  getTokenAnalysisReport: () => get('/vending/reports/token-analysis'),
  getSystemAuditReport: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/vending/reports/system-audit${q ? '?' + q : ''}`);
  },
};

// ===== INTEGRATION API GATEWAY =====
export const integrationAPI = {
  // Partners
  getPartners: () => get('/integration/partners'),
  getPartner: (id) => get(`/integration/partners/${id}`),
  createPartner: (data) => post('/integration/partners', data),
  updatePartner: (id, data) => put(`/integration/partners/${id}`, data),
  approvePartner: (id, data) => post(`/integration/partners/${id}/approve`, data),
  suspendPartner: (id, data) => post(`/integration/partners/${id}/suspend`, data),
  revokePartner: (id) => post(`/integration/partners/${id}/revoke`, {}),
  regenerateKeys: (id) => post(`/integration/partners/${id}/regenerate-keys`, {}),
  // Logs & Stats
  getApiLog: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/integration/api-log${q ? '?' + q : ''}`);
  },
  getApiStats: () => get('/integration/api-stats'),
  getWebhookLog: () => get('/integration/webhook-log'),
};

// ===== NET METERING =====
export const netMeteringAPI = {
  getLatest: (drn) => get(`/mqtt/net-energy/${drn}`),
  getSummary: (drn) => get(`/mqtt/net-energy/${drn}/summary`),
  getHistory: (drn, limit = 30) => get(`/mqtt/net-energy/${drn}/history?limit=${limit}`),
  getHourly: (drn, date) => get(`/mqtt/net-energy/${drn}/hourly${date ? '?date=' + date : ''}`),
  getDaily: (drn, days = 30) => get(`/mqtt/net-energy/${drn}/daily?days=${days}`),
  getDashboard: (period) => get('/mqtt/net-energy/dashboard' + (period ? '?period=' + period : '')),
  getActiveMeters: () => get('/mqtt/net-energy/active-meters'),
  getConfig: (drn) => get(`/mqtt/net-metering-config/${drn}`),
  setConfig: (drn, data) => post(`/mqtt/net-metering-config/${drn}`, data),
  getAllConfigs: () => get('/mqtt/net-metering-configs'),
};

// ===== ACTUAL ENERGY =====
export const actualEnergyAPI = {
  getHourly: (drn, date) => get(`/mqtt/actual-energy/${drn}/hourly${date ? '?date=' + date : ''}`),
  getDaily: (drn, days = 30) => get(`/mqtt/actual-energy/${drn}/daily?days=${days}`),
};

// ===== NON-GRIDX CUSTOMERS =====
export const nonGridxAPI = {
  getCustomers: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return get(`/vending/non-gridx-customers${q ? '?' + q : ''}`);
  },
  getCustomer: (id) => get(`/vending/non-gridx-customers/${id}`),
  createCustomer: (data) => post('/vending/non-gridx-customers', data),
  updateCustomer: (id, data) => put(`/vending/non-gridx-customers/${id}`, data),
  deleteCustomer: (id) => del(`/vending/non-gridx-customers/${id}`),
  importCSV: (formData) => uploadFile('/vending/non-gridx-customers/import', formData),
  getProviders: () => get('/vending/non-gridx-customers/providers/list'),
};

// ===== DATA USAGE =====
export const dataUsageAPI = {
  getNetworkToday: () => get('/summary/data-usage/network/today'),
  getNetworkDaily: (days = 30) => get(`/summary/data-usage/network/daily?days=${days}`),
  getNetworkMeters: (days = 7) => get(`/summary/data-usage/network/meters?days=${days}`),
  getMeterToday: (drn) => get(`/summary/data-usage/meter/${drn}/today`),
  getMeterDaily: (drn, days = 30) => get(`/summary/data-usage/meter/${drn}/daily?days=${days}`),
  getBreakdown: (drn, days = 7) => get(`/summary/data-usage/breakdown/${drn}?days=${days}`),
  getNetworkBreakdown: (days = 7) => get(`/summary/data-usage/network/breakdown?days=${days}`),
  getConfig: () => get('/summary/data-usage/config'),
  updateConfig: (data) => put('/summary/data-usage/config', data),
};

// ===== ENERGY ANALYTICS =====
export const energyAnalyticsAPI = {
  getRegionalSummary: () => get('/energy-analytics/regional-summary'),
  getSubstations: () => get('/energy-analytics/substations'),
  getSubstationConfig: () => get('/energy-analytics/substation-config'),
  getPowerFlow: () => get('/energy-analytics/power-flow'),
  getMeterDetail: (drn) => get(`/energy-analytics/meter-detail/${drn}`),
  getDistrictStats: () => get('/energy-analytics/district-stats'),
  getSuburbBoundaries: () => get('/energy-analytics/suburb-boundaries'),
  triggerReverseGeocode: () => get('/energy-analytics/reverse-geocode'),
};

export default {
  auth: authAPI,
  meter: meterAPI,
  energy: energyAPI,
  finance: financeAPI,
  token: tokenAPI,
  notification: notificationAPI,
  billing: billingAPI,
  postpaid: postpaidAPI,
  settings: settingsAPI,
  meterProfile: meterProfileAPI,
  meterRegistration: meterRegistrationAPI,
  suburb: suburbAPI,
  loadControl: loadControlAPI,
  groupControl: groupControlAPI,
  mqtt: mqttAPI,
  commissionReport: commissionReportAPI,
  homeClassification: homeClassificationAPI,
  meterHealth: meterHealthAPI,
  relayEvents: relayEventsAPI,
  vending: vendingAPI,
  integration: integrationAPI,
  nonGridx: nonGridxAPI,
  netMetering: netMeteringAPI,
  dataUsage: dataUsageAPI,
  energyAnalytics: energyAnalyticsAPI,
};
