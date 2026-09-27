const Application = require('../models/Application');

async function generateApplicationNumber() {
  const year = new Date().getFullYear();
  const countThisYear = await Application.countDocuments({
    applicationNumber: { $regex: `^APP-${year}-` },
  });
  const seq = String(countThisYear + 1).padStart(4, '0');
  return `APP-${year}-${seq}`;
}

module.exports = { generateApplicationNumber };
