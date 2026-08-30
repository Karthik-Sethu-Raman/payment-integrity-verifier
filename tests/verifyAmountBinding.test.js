const verifyAmountBinding = require('../utils/verifyAmountBinding');

describe('Amount Binding Verification Check', () => {
  const mockStore = {
    getTrustedOrder: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return valid true when amounts match perfectly', () => {
    mockStore.getTrustedOrder.mockReturnValue({ amount: 50000 });
    
    const result = verifyAmountBinding('order_123', 50000, mockStore);
    expect(result).toEqual({ valid: true });
    expect(mockStore.getTrustedOrder).toHaveBeenCalledWith('order_123');
  });

  test('should return valid false and amount_mismatch when amounts differ', () => {
    mockStore.getTrustedOrder.mockReturnValue({ amount: 50000 });
    
    const result = verifyAmountBinding('order_123', 100, mockStore); // Attacker claimed 100
    expect(result).toEqual({ 
      valid: false, 
      reason: 'amount_mismatch',
      expected: 50000,
      actual: 100
    });
  });

  test('should return valid false and unknown_order when order is not in store', () => {
    mockStore.getTrustedOrder.mockReturnValue(undefined);
    
    const result = verifyAmountBinding('order_unknown', 50000, mockStore);
    expect(result).toEqual({ 
      valid: false, 
      reason: 'unknown_order'
    });
  });
});
