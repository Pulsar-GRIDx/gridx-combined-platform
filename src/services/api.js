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

function get(url) {
  return request(url);
}

function post(url, body) {
  return request(url, { method: 'POST', body: JSON.stringify(body) });
}

function put(url, body) {
  return request(url, { method: 'PUT', body: JSON.stringify(body) });
}

function del(url) {
  return request(url, { method: 'DELETE' });
}

// ===== AUTH =====
export const authAPI = {
  login: (Email, Password) => post('/signin', { Email, Password }),
  signup: (data) => post('/adminSignup', data),
  getProfile: (id) => get(`/profile/${id}`),
  getAllAdmins: () => get('/allAdmins'),
  getAllUsers: () => get('/allUsers'),
  updateAdmin: (id, data) => post(`/AdminUpdate/${id}`, data),
  updateUser: (id, data) => post(`/UserUpdate/${id}`, data),
  deleteAdmin: (id) => del(`/deleteAdmin/${id}`),
  updateAdminStatus: (id) => post(`/updateStatus/${id}`),
  resetPassword: (id, Password) => post(`/resetPassword/${id}`, { Password }),
  forgotPassword: (Email) => post('/forgot-password', { Email }),
  verifyPin: (Email, pin) => post('/verify-pin', { Email, pin }),
  resetForgottenPassword: (Email, pin, newPassword) =>
    post('/reset-forgotten-password', { Email, pin, newPassword }),
  getAccessLevel: () => get('/adminAuth/accessLevel'),
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
};

// ===== FINANCIAL =====
export const financeAPI = {
  getTimePeriods: () => get('/finance/time-periods'),
  getMonthlyYearly: () => get('/finance/currentAndLastYearMonthRevenueTotal'),
  getWeekly: () => get('/finance/currentAndLastWeek'),
  getHourlyRevenue: () => get('/finance/hourlyRevenue'),
  getSuburbTimePeriod: (suburbs) => post('/finance/suburbTimePeriod', { suburbs }),
  getSuburbWeekly: (suburbs) => post('/finance/suburbWeeklyRevenue', { suburbs }),
  getSuburbYearly: (suburbs) => post('/finance/suburbYearlyRevenue', { suburbs }),
  getPastWeekTokens: () => get('/finance/pastWeekTokens'),
  getEnergyOverview: () => get('/finance/energy-overview'),
};

// ===== TOKENS =====
export const tokenAPI = {
  getAmount: () => get('/tokenAmount'),
  getCount: () => get('/totalTokensBought'),
  getAllProcessed: () => get('/get-system-processed-tokens'),
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

// ===== METER BILLING =====
export const billingAPI = {
  getConfig: (drn) => get(`/meter-billing/config/${drn}`),
  setPrepaid: (data) => post('/meter-billing/config/prepaid', data),
  setPostpaid: (data) => post('/meter-billing/config/postpaid', data),
  setTier: (data) => post('/meter-billing/config/tier', data),
};

// ===== METER PROFILE =====
export const meterProfileAPI = {
  get: () => get('/settings/meterProfile'),
  update: (data) => post('/settings/meterProfile', data),
};

// ===== COMMISSION REPORTS =====
export const commissionReportAPI = {
  getByDRN: (drn) => get(`/settings/commissionReports/${drn}`),
  getLatest: (drn) => get(`/settings/commissionReport/latest/${drn}`),
  getById: (id) => get(`/settings/commissionReport/${id}`),
};

// ===== HOME CLASSIFICATION =====
export const homeClassificationAPI = {
  getByDRN: (drn) => get(`/settings/homeClassifications/${drn}`),
  getLatest: (drn) => get(`/settings/homeClassification/latest/${drn}`),
  getById: (id) => get(`/settings/homeClassification/${id}`),
};

// ===== METER HEALTH (STS Backend) =====
export const meterHealthAPI = {
  getLatest: (drn) => request(`/api/v1/meter-health/${drn}`),
  getHistory: (drn, limit = 72) => request(`/api/v1/meter-health/${drn}/history?limit=${limit}`),
};

// ===== RELAY EVENTS (STS Backend) =====
export const relayEventsAPI = {
  getEvents: (drn, { limit = 100, offset = 0, relay, type } = {}) => {
    let url = `/api/v1/relay-events/${drn}?limit=${limit}&offset=${offset}`;
    if (relay !== undefined && relay !== '') url += `&relay=${relay}`;
    if (type !== undefined && type !== '') url += `&type=${type}`;
    return request(url);
  },
  getSummary: (drn, hours = 168) => request(`/api/v1/relay-events/${drn}/summary?hours=${hours}`),
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
  randomize: (data) => post('/loadcontrol/randomize', data),
};

// ===== MQTT =====
export const mqttAPI = {
  getStatus: () => get('/mqtt/status'),
  sendCommand: (drn, command) => post(`/mqtt/command/${drn}`, command),
  testPublish: (drn) => post('/mqtt/test-publish', { drn }),
};

// ===== SUBURB ENERGY =====
export const suburbAPI = {
  getEnergy: (suburbs) => post('/suburbEnergy', { suburbs }),
};

export default {
  auth: authAPI,
  meter: meterAPI,
  energy: energyAPI,
  finance: financeAPI,
  token: tokenAPI,
  notification: notificationAPI,
  billing: billingAPI,
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
};
