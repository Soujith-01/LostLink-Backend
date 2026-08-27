import jwt from 'jsonwebtoken';
import UserModel from '../models/UserModel.js';

export const verifyToken = (...roles) => {
  // If invoked as standard Express middleware verifyToken(req, res, next)
  if (roles.length === 3 && typeof roles[2] === 'function' && roles[0]?.headers) {
    const [req, res, next] = roles;
    return handleAuth(req, res, next, []);
  }

  // Otherwise invoked as factory function verifyToken('ADMIN')
  const allowedRoles = roles.flat().map((r) => String(r).toLowerCase());
  return (req, res, next) => handleAuth(req, res, next, allowedRoles);
};

const handleAuth = async (req, res, next, allowedRoles = []) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ message: 'Token missing. Unauthorized access.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.SECRET_KEY || 'default_secret');
    const user = await UserModel.findById(decoded.id || decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.isActive === false || user.isUserActive === false) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    req.user = {
      ...user.toObject(),
      userId: user._id,
    };

    if (allowedRoles.length > 0) {
      const userRole = String(user.role).toLowerCase();
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: `Access denied. Requires role: ${allowedRoles.join(', ')}` });
      }
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export default verifyToken;
