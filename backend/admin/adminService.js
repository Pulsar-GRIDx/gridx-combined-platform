const connection = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');



//Register New Admin//

exports.registerAdmin = async (Username, Password, FirstName, LastName, Email, IsActive, RoleName, AccessLevel) => {
 
  const hashedPassword = await bcrypt.hash(Password, 10);

  return new Promise((resolve, reject) => {
    connection.query(
      'INSERT INTO SystemAdmins (Username, Password, FirstName, LastName, Email, IsActive, RoleName, AccessLevel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [Username, hashedPassword, FirstName, LastName, Email, IsActive, RoleName, AccessLevel],
      (err, result) => {
        if (err) {
          console.error('Registration error:', err);
          reject(err);
        }
        console.log('Registration successful');
        resolve(result);
      }
    );
  });
};

//Admin SignIn//

exports.signIn = async (Email, Password, GuestID, ipAddress = null) => {
  if (!GuestID && (!Email || !Password)) {
    throw new Error('Invalid request');
  }

  if (GuestID) {
    const findGuestQuery = 'SELECT * FROM guest_users WHERE GuestID = ?';
    const updateGuestQuery = 'UPDATE guest_users SET login_count = login_count + 1 WHERE GuestID = ?';

    const guestUser = await new Promise((resolve, reject) => {
      connection.query(findGuestQuery, [GuestID], (err, results) => {
        if (err) {
          reject(err);
        } else if (results.length === 0) {
          reject(new Error('Authentication failed'));
        } else {
          resolve(results[0]);
        }
      });
    });

    await new Promise((resolve, reject) => {
      connection.query(updateGuestQuery, [GuestID], (err, updateResult) => {
        if (err) {
          reject(err);
        } else {
          resolve(updateResult);
        }
      });
    });

    const token = jwt.sign(
      { GuestID: guestUser.GuestID, name: guestUser.name, role: 'guest' },
      process.env.SECRET_KEY,
      { expiresIn: '10m' }
    );

    return {
      token,
      user: {
        GuestID: guestUser.GuestID,
        name: guestUser.name,
        role: 'guest',
        redirect: `/protected?token=${encodeURIComponent(token)}`
      }
    };
  } else {
    // Regular Admin sign-in
    // Find the Admin by email
    const findUserQuery = 'SELECT * FROM SystemAdmins WHERE Email = ?';
  const updateUserQuery = `UPDATE SystemAdmins
  SET login_count = COALESCE(login_count, 0) + 1,
    lastLoginTime = ?,
    ip_address = ?
  WHERE Admin_ID = ?;
`;

    const admin = await new Promise((resolve, reject) => {
      connection.query(findUserQuery, [Email], (err, results) => {
        if (err) {
          reject(err);
        } else if (results.length === 0) {
        const notFoundError = new Error('Email not found');
        notFoundError.status = 404; // Set a status code for not found
        reject(notFoundError);
        } else {
          resolve(results[0]);
        }
      });
    });

    const isMatch = await bcrypt.compare(Password, admin.Password);
  if (!isMatch) {
    const mismatchError = new Error('Password mismatch');
    mismatchError.status = 401; // Unauthorized
    throw mismatchError; // Throw the custom error
  }

    const loginTimestamp = new Date();

    await new Promise((resolve, reject) => {
      connection.query(updateUserQuery, [loginTimestamp, ipAddress || null, admin.Admin_ID], (err, updateResult) => {
        if (err) {
          reject(err);
        } else {
          resolve(updateResult);
        }
      });
    });

    const refreshedAdmin = await new Promise((resolve, reject) => {
      connection.query(findUserQuery, [Email], (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results[0]);
        }
      });
    });

    const token = jwt.sign(
      { Admin_ID: admin.Admin_ID, Email: admin.Email, AccessLevel: admin.AccessLevel },
      process.env.SECRET_KEY,
      { expiresIn: '1h' } // Token expires in 1 hour
    );

    return {
      token,
      user: {
        Admin_ID: admin.Admin_ID,
        email: admin.Email,
        name : admin.Username,
        AccessLevel: admin.AccessLevel,
        lastLoginTime: refreshedAdmin?.lastLoginTime || loginTimestamp,
        ip_address: refreshedAdmin?.ip_address || ipAddress || null,
        redirect: (`/protected?token=${encodeURIComponent(token)}`)
        
      }
      
    };
  }
};

//Get user profile

exports.getUserProfile = (UserID) => {
  return new Promise((resolve, reject) => {
    connection.query('SELECT FirstName, Email FROM SystemUsers WHERE UserID = ?', [UserID], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
};
//Get all users
exports.getAllUsers = () => {
  return new Promise((resolve, reject) => {
    connection.query('SELECT UserID, FirstName, Email, lastName FROM SystemUsers', (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};

//Get all Admins
exports.getAllAdmins = () => {
  return new Promise((resolve, reject) => {
    connection.query('SELECT Admin_ID, Username, FirstName, LastName, Password, Email, IsActive, AccessLevel FROM SystemAdmins', (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
        console.log(results);
      }
    });
  });
};

//Update User
exports.updateUserInfo = (UserID, FirstName, Email, LastName, DRN) => {
  return new Promise((resolve, reject) => {
    const updateUserQuery = 'UPDATE SystemUsers SET FirstName = ?, Email = ?, LastName = ?, DRN = ? WHERE UserID = ?';
    connection.query(updateUserQuery, [FirstName, Email, LastName, DRN, UserID], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};
//Update ADMIN
exports.updateAdminInfo = (Admin_ID, FirstName, Email, LastName, AccessLevel, Username) => {
  return new Promise((resolve, reject) => {
    const updateUserQuery = 'UPDATE SystemAdmins SET FirstName = ?, Email = ?, LastName = ?, AccessLevel = ?, Username = ? WHERE Admin_ID = ?';
    connection.query(updateUserQuery, [FirstName, Email, LastName, AccessLevel, Username, Admin_ID], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};
//Delete Admin
exports.deleteAdmin = (Admin_ID) => {
  return new Promise((resolve, reject) => {
    const deleteUserQuery = 'DELETE FROM SystemAdmin WHERE Admin_ID = ?';
    connection.query(deleteUserQuery, [Admin_ID], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
};
//Update AdminStatus
exports.updateAdminStatus = (Admin_ID) => {
  return new Promise((resolve, reject) => {
    const checkUserQuery = 'SELECT * FROM SystemAdmins WHERE Admin_ID = ?';
    connection.query(checkUserQuery, [Admin_ID], (err, results) => {
      if (err) {
        reject(err);
      } else {
        if (results.length === 0) {
          reject(new Error('Admin not found'));
          return;
        }
        const admin = results[0];
        const newStatus = admin.IsActive === 1 ? 0 : 1;
        const updateStatusQuery = 'UPDATE SystemAdmins SET IsActive = ? WHERE Admin_ID = ?';
        connection.query(updateStatusQuery, [newStatus, Admin_ID], (err, updateResult) => {
          if (err) {
            reject(err);
          } else {
            resolve(newStatus);
          }
        });
      }
    });
  });
};


//Reset Admin Password
exports.resetAdminPassword = (Admin_ID, Password) => {
  return new Promise((resolve, reject) => {
    const checkPasswordQuery = 'SELECT Password FROM SystemAdmins WHERE Admin_ID = ?';
    connection.query(checkPasswordQuery, [Admin_ID], (err, results) => {
      if (err) {
        reject(err);
      } else {
        const currentPassword = results[0].Password;
        bcrypt.compare(Password, currentPassword, (err, isMatch) => {
          if (err) {
            reject(err);
          } else if (isMatch) {
            reject({ message: 'Please choose a different password' });
          } else {
            bcrypt.hash(Password, 10, (err, hashedPassword) => {
              if (err) {
                reject(err);
              } else {
                const updatePasswordQuery = 'UPDATE SystemAdmins SET Password = ? WHERE Admin_ID = ?';
                connection.query(updatePasswordQuery, [hashedPassword, Admin_ID], (err, updateResult) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              }
            });
          }
        });
      }
    });
  });
};

//Get Admin Data

exports.getAdminData = (Admin_ID) => {
  return new Promise((resolve, reject) => {
    connection.query('SELECT * FROM SystemAdmins WHERE Admin_ID = ?', [Admin_ID], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
};

//Get Admin by Email
exports.getAdminByEmail = (Email) => {
  return new Promise((resolve, reject) => {
    connection.query('SELECT * FROM SystemAdmins WHERE Email = ?', [Email], (err, results) => {
      if (err) reject(err);
      else resolve(results[0]);
    });
  });
};

//Reset Admin Password by Email
exports.resetAdminPasswordByEmail = (Email, Password) => {
  return new Promise((resolve, reject) => {
    bcrypt.hash(Password, 10, (err, hashedPassword) => {
      if (err) return reject(err);
      const updatePasswordQuery = 'UPDATE SystemAdmins SET Password = ? WHERE Email = ?';
      connection.query(updatePasswordQuery, [hashedPassword, Email], (err, updateResult) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};