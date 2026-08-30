const verifyReplay = require('../utils/verifyReplay');

describe('Replay Verification Check', () => {
  const mockStore = {
    hasProcessedEvent: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return valid true when event is seen for the first time', () => {
    mockStore.hasProcessedEvent.mockReturnValue(false);
    
    const result = verifyReplay('evt_123', mockStore);
    expect(result).toEqual({ valid: true });
    expect(mockStore.hasProcessedEvent).toHaveBeenCalledWith('evt_123');
  });

  test('should return valid false and replay_detected when event is seen again', () => {
    mockStore.hasProcessedEvent.mockReturnValue(true);
    
    const result = verifyReplay('evt_123', mockStore);
    expect(result).toEqual({ 
      valid: false, 
      reason: 'replay_detected'
    });
  });

  test('should return valid false when event ID is missing', () => {
    const result = verifyReplay(undefined, mockStore);
    expect(result).toEqual({ 
      valid: false, 
      reason: 'missing_event_id'
    });
  });
});
