// this is strictly used while development for testing purposes

const ChildProduct = require('../../models/masterModels/ChildProduct')
const ParentProduct = require('../../models/masterModels/ParentProduct')
const MainParentProduct = require('../../models/masterModels/MainParent')

exports.resetAllChildProducts = async (req, res) => {
  try {
    await ChildProduct.updateMany(
      {},
      {
        $set: {
          "stockByUnit.$[].totalCPQuantity": 0,
          "stockByUnit.$[].availableToCommitCPQuantity": 0,
          "stockByUnit.$[].committedCPQuantity": 0
        }
      }
    );

    res.status(200).json({ message: 'All child products reset successfully.' });
  } catch (err) {
    console.error('Error resetting child products:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.resetAllParentProducts = async (req, res) => {
  try {
    await ParentProduct.updateMany(
      {},
      {
        $set: {
          "stockByUnit.$[].totalPPQuantity": 0,
          "stockByUnit.$[].availableToCommitPPQuantity": 0,
          "stockByUnit.$[].committedPPQuantity": 0
        }
      }
    );

    res.status(200).json({ message: 'All parent products reset successfully.' });
  } catch (err) {
    console.error('Error resetting parent products:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.resetAllMainParentProducts = async (req, res) => {
  try {
    await MainParentProduct.updateMany(
      {},
      {
        $set: {
          "stockByUnit.$[].totalMPQuantity": 0,
          "stockByUnit.$[].availableToCommitMPQuantity": 0,
          "stockByUnit.$[].committedMPQuantity": 0
        }
      }
    );

    res.status(200).json({ message: 'All main parent products reset successfully.' });
  } catch (err) {
    console.error('Error resetting main parent products:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.ProductSharetesting = async (req,res)=>{
  let ids=['685136e3337303ec1946a0ce','685164df709130a06e929737']
  let parent=['68525576b5960c94d21d5d0f','6852559bb5960c94d21d5d23']
  try{
    ids.map(async(val)=>{
await ChildProduct.findByIdAndUpdate(val,{
  $set:{
    totalCPQuantity:75,
    committedCPQuantity:75
  }
})
    })

     parent.map(async(val)=>{
await ParentProduct.findByIdAndUpdate(val,{
  $set:{
    totalPPQuantity:5,
    committedPPQuantity:5
  }
})
    })

await MainParentProduct.findByIdAndUpdate('68529c41756f6f5e4be258be',{
  $set:{
    totalMPQuantity:1,
    availableToCommitMPQuantity:1
  }
})    
  res.status(200).json({ message: 'All products update successfully.' });
  } catch (err) {
    console.error('Error updating products:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}