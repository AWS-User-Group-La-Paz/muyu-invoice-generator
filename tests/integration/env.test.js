describe('Environment Validation', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.exit = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    process.exit = originalExit;
  });

  test('should exit if DATABASE_URL is missing in non-test env', () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'production'; // Simulate non-test env
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Requiring the file should trigger the check
    require('../../src/web');
    
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('FATAL'));
    
    errorSpy.mockRestore();
  });

  test('should NOT exit if DATABASE_URL is missing in test env', () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    require('../../src/web');
    
    expect(process.exit).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
